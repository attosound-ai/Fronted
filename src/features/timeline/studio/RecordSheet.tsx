import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, View } from 'react-native';
import NativeSlider from '@react-native-community/slider';
import {
  ChevronDown,
  ChevronUp,
  Mic,
  Pause,
  Play,
  Square,
  Trash2,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Text } from '@/components/ui/Text';
import { haptic } from '@/lib/haptics/hapticService';
import {
  addMetersListener,
  addPreviewEndedListener,
  addStateListener,
  armRecorder,
  configureRecorder,
  disarmRecorder,
  discardRecording,
  getSessionInfo,
  isRecorderAvailable,
  listInputs,
  listOutputs,
  pauseRecording,
  previewPlay,
  previewStop,
  requestRecorderPermission,
  resumeRecording,
  setInput,
  startRecording,
  stopRecording,
  type MonitorReverbPreset,
  type OverdubStem,
  type RecorderPort,
  type StopResult,
} from '../../../../modules/atto-recorder';
import { STUDIO_COLORS } from './studioTheme';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Timeline position the take starts at (the selection line). */
  fromMs: number;
  /** Called when the user keeps the take; the sheet closes after it resolves. */
  onPlace: (take: StopResult) => Promise<void>;
  /**
   * Local copies of the other lanes' clips, so the recorder can play them on
   * its own engine while the take runs. The JS timeline must NOT play at the
   * same time: expo-audio activates the session on the main thread and that
   * freezes the app while the recorder owns it.
   */
  prepareStems: (excludeLane: number) => Promise<OverdubStem[]>;
  /** The lane the take lands on; its own clips are left out of the stems. */
  laneIndex: number;
  /** During a call the recorder must not take the session; the sheet says so. */
  blocked?: boolean;
  trackName: string;
}

type Phase =
  | 'arming'
  | 'ready'
  | 'recording'
  | 'paused'
  | 'review'
  | 'placing'
  | 'blocked';

/** Flip to false to open the monitor reverb again; nothing else gates it. */
const MONITOR_REVERB_LOCKED = true;

const REVERB_PRESETS: MonitorReverbPreset[] = [
  'smallRoom',
  'mediumRoom',
  'largeRoom',
  'plate',
  'largeHall',
];

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 10));
  const cs = total % 100;
  const s = Math.floor(total / 100) % 60;
  const m = Math.floor(total / 6000);
  const two = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${two(m)}:${two(s)}.${two(cs)}`;
}

/** dBFS to a 0..1 bar length; minus 60 dB is empty, 0 dB is full. */
function dbToLevel(db: number): number {
  if (!Number.isFinite(db)) return 0;
  return Math.max(0, Math.min(1, (db + 60) / 60));
}

function Meter({ label, level }: { label: string; level: SharedValue<number> }) {
  const fill = useAnimatedStyle(() => ({
    width: `${level.value * 100}%`,
    backgroundColor:
      level.value > 0.92 ? STUDIO_COLORS.meterHigh : STUDIO_COLORS.meterLow,
  }));
  return (
    <View style={styles.meterRow}>
      <Text variant="caption" style={styles.meterLabel}>
        {label}
      </Text>
      <View style={styles.meterTrack}>
        <Animated.View style={[styles.meterFill, fill]} />
        {Array.from({ length: 11 }, (_, i) => (
          <View key={i} style={[styles.meterTick, { left: `${i * 10}%` }]} />
        ))}
      </View>
    </View>
  );
}

/**
 * The recording sheet: a digital clock, input and output meters, the big
 * record button that becomes Stop, pause and resume, then a listen back
 * step with Place on track and Discard. The settings fold holds what
 * SoundLab spreads across its Recording Studio and overdub settings:
 * input and output device, live monitoring, input gain, limiter, monitor
 * reverb and the overdub volume. The take is captured by the native
 * recorder; the timeline plays the other tracks underneath.
 */
export function RecordSheet({
  visible,
  onClose,
  fromMs,
  onPlace,
  prepareStems,
  laneIndex,
  blocked = false,
  trackName,
}: Props) {
  const { t } = useTranslation('projects');
  const [phase, setPhase] = useState<Phase>('arming');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [take, setTake] = useState<StopResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [inputs, setInputs] = useState<RecorderPort[]>([]);
  const [outputs, setOutputs] = useState<RecorderPort[]>([]);
  const [monitoring, setMonitoring] = useState(false);
  const [inputGainDb, setInputGainDb] = useState(0);
  const [limiter, setLimiter] = useState(true);
  const [reverb, setReverb] = useState(false);
  const [reverbPreset, setReverbPreset] = useState<MonitorReverbPreset>('mediumRoom');
  const [overdub, setOverdub] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const inputLevel = useSharedValue(0);
  const outputLevel = useSharedValue(0);
  const phaseRef = useRef<Phase>('arming');
  phaseRef.current = phase;

  const refreshPorts = useCallback(async () => {
    try {
      const [ins, outs] = await Promise.all([listInputs(), listOutputs()]);
      setInputs(ins);
      setOutputs(outs);
    } catch {
      // Port listing is informational.
    }
  }, []);

  // Arm on open (session, engine, meters), disarm on close.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setTake(null);
    setElapsedMs(0);
    setError(null);
    setPreviewing(false);
    if (blocked || !isRecorderAvailable()) {
      setPhase('blocked');
      return;
    }
    setPhase('arming');
    (async () => {
      try {
        const ok = await requestRecorderPermission();
        if (!ok) throw new Error(t('studio.record.noPermission'));
        const stems = overdub ? await prepareStems(laneIndex) : [];
        if (cancelled) return;
        await configureRecorder({
          monitoring,
          inputGainDb,
          limiter,
          monitorReverb: reverb,
          monitorReverbPreset: reverbPreset,
          overdubPaths: stems,
          format: 'caf',
        });
        await armRecorder();
        if (cancelled) return;
        await refreshPorts();
        setPhase('ready');
      } catch (e: unknown) {
        if (cancelled) return;
        // Name the real reason: permission, the session someone else holds, or
        // a route with no input. Without this the sheet only said "blocked".
        const info = getSessionInfo();
        const granted = await requestRecorderPermission().catch(() => false);
        const detail = info
          ? ` (${info.category}, ${info.mode}, otherAudio ${info.otherAudioPlaying}, mic ${granted})`
          : ` (mic ${granted})`;
        setError((e instanceof Error ? e.message : String(e)) + detail);
        setPhase('blocked');
      }
    })();
    const meters = addMetersListener((m) => {
      inputLevel.value = withTiming(dbToLevel(m.inputPeakDb), { duration: 50 });
      outputLevel.value = withTiming(dbToLevel(m.outputPeakDb), { duration: 50 });
      if (m.state === 'recording') setElapsedMs(m.elapsedMs);
    });
    const states = addStateListener((s) => {
      // The arming catch below writes a detailed message; do not overwrite it.
      if (s.state === 'error') setError((prev) => prev ?? s.reason ?? 'error');
      if (s.reason === 'route_change') void refreshPorts();
    });
    const ended = addPreviewEndedListener(() => setPreviewing(false));
    return () => {
      cancelled = true;
      meters.remove();
      states.remove();
      ended.remove();
      void previewStop().catch(() => {});
      const p = phaseRef.current;
      if (p === 'recording' || p === 'paused') {
        void discardRecording().catch(() => {});
      } else {
        void disarmRecorder().catch(() => {});
      }
    };
    // Settings changes are pushed by the effect below, not by re arming.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, blocked, retryToken, overdub]);

  // Live parameters apply immediately, even mid take.
  useEffect(() => {
    if (!visible || phase === 'blocked' || phase === 'arming') return;
    void configureRecorder({
      monitoring,
      inputGainDb,
      limiter,
      monitorReverb: reverb,
      monitorReverbPreset: reverbPreset,
    }).catch(() => {});
  }, [visible, phase, monitoring, inputGainDb, limiter, reverb, reverbPreset]);

  const handleRecord = useCallback(async () => {
    void haptic('heavy');
    try {
      setError(null);
      await startRecording({ fromMs });
      setPhase('recording');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [fromMs]);

  const handleStop = useCallback(async () => {
    void haptic('medium');
    try {
      const result = await stopRecording();
      setTake(result);
      setElapsedMs(result.durationMs);
      setPhase('review');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('ready');
    }
  }, []);

  const handlePause = useCallback(async () => {
    void haptic('light');
    try {
      await pauseRecording();
      setPhase('paused');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const handleResume = useCallback(async () => {
    void haptic('light');
    try {
      await resumeRecording();
      setPhase('recording');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const handlePreview = useCallback(async () => {
    if (!take) return;
    void haptic('light');
    if (previewing) {
      await previewStop().catch(() => {});
      setPreviewing(false);
      return;
    }
    try {
      setPreviewing(true);
      await previewPlay(take.path);
    } catch (e: unknown) {
      setPreviewing(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [take, previewing]);

  const handleDiscard = useCallback(async () => {
    void haptic('medium');
    await previewStop().catch(() => {});
    setPreviewing(false);
    await discardRecording().catch(() => {});
    setTake(null);
    setElapsedMs(0);
    try {
      await armRecorder();
      setPhase('ready');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('blocked');
    }
  }, []);

  const handlePlace = useCallback(async () => {
    if (!take) return;
    void haptic('success');
    await previewStop().catch(() => {});
    setPreviewing(false);
    setPhase('placing');
    try {
      await onPlace(take);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('review');
    }
  }, [take, onPlace, onClose]);

  const selectedInput = inputs.find((i) => i.selected) ?? inputs[0];
  const busy = phase === 'recording' || phase === 'paused' || phase === 'placing';

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('studio.record.title', { track: trackName })}
      dismissible={!busy}
    >
      <View style={styles.content}>
        <Text variant="caption" style={styles.clockLabel}>
          {t('studio.record.startsAt', { time: formatClock(fromMs) })}
        </Text>
        <Text style={styles.clock} maxFontSizeMultiplier={1.0}>
          {formatClock(elapsedMs)}
        </Text>

        <Meter label={t('studio.record.input')} level={inputLevel} />
        <Meter label={t('studio.record.output')} level={outputLevel} />

        {error && (
          <Text variant="caption" style={styles.error}>
            {error}
          </Text>
        )}

        {phase === 'blocked' && !error && (
          <Text variant="small" style={styles.blocked}>
            {blocked ? t('studio.record.blockedInCall') : t('studio.record.unavailable')}
          </Text>
        )}
        {phase === 'blocked' && error && (
          <Pressable
            onPress={() => setRetryToken((n) => n + 1)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
          >
            <Text variant="small" style={styles.retryText}>
              {t('studio.record.retry')}
            </Text>
          </Pressable>
        )}

        {/* Transport of the sheet */}
        <View style={styles.transport}>
          {(phase === 'ready' || phase === 'arming') && (
            <Pressable
              onPress={handleRecord}
              disabled={phase !== 'ready'}
              accessibilityRole="button"
              accessibilityLabel={t('studio.record.tapToRecord')}
              style={({ pressed }) => [
                styles.recordButton,
                phase !== 'ready' && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              {phase === 'arming' ? (
                <ActivityIndicator color={STUDIO_COLORS.text} />
              ) : (
                <>
                  <Mic size={22} color={STUDIO_COLORS.text} strokeWidth={2.25} />
                  <Text variant="body" style={styles.recordLabel}>
                    {t('studio.record.tapToRecord')}
                  </Text>
                </>
              )}
            </Pressable>
          )}
          {(phase === 'recording' || phase === 'paused') && (
            <View style={styles.row}>
              <Pressable
                onPress={phase === 'recording' ? handlePause : handleResume}
                accessibilityRole="button"
                style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
              >
                {phase === 'recording' ? (
                  <Pause size={20} color={STUDIO_COLORS.text} fill={STUDIO_COLORS.text} />
                ) : (
                  <Play size={20} color={STUDIO_COLORS.text} fill={STUDIO_COLORS.text} />
                )}
              </Pressable>
              <Pressable
                onPress={handleStop}
                accessibilityRole="button"
                accessibilityLabel={t('studio.record.stop')}
                style={({ pressed }) => [
                  styles.recordButton,
                  styles.stopButton,
                  pressed && styles.pressed,
                ]}
              >
                <Square size={18} color={STUDIO_COLORS.text} fill={STUDIO_COLORS.text} />
                <Text variant="body" style={styles.recordLabel}>
                  {phase === 'paused'
                    ? t('studio.record.paused')
                    : t('studio.record.stop')}
                </Text>
              </Pressable>
            </View>
          )}
          {(phase === 'review' || phase === 'placing') && (
            <View style={styles.review}>
              <View style={styles.row}>
                <Pressable
                  onPress={handleDiscard}
                  disabled={phase === 'placing'}
                  accessibilityRole="button"
                  accessibilityLabel={t('studio.record.discard')}
                  style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
                >
                  <Trash2 size={20} color={STUDIO_COLORS.text} strokeWidth={2.25} />
                </Pressable>
                <Pressable
                  onPress={handlePreview}
                  disabled={phase === 'placing'}
                  accessibilityRole="button"
                  accessibilityLabel={t('studio.record.listen')}
                  style={({ pressed }) => [
                    styles.roundButton,
                    styles.listen,
                    pressed && styles.pressed,
                  ]}
                >
                  {previewing ? (
                    <Square
                      size={18}
                      color={STUDIO_COLORS.onPrimary}
                      fill={STUDIO_COLORS.onPrimary}
                    />
                  ) : (
                    <Play
                      size={20}
                      color={STUDIO_COLORS.onPrimary}
                      fill={STUDIO_COLORS.onPrimary}
                    />
                  )}
                </Pressable>
                <Pressable
                  onPress={handlePlace}
                  disabled={phase === 'placing'}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.placeButton, pressed && styles.pressed]}
                >
                  {phase === 'placing' ? (
                    <ActivityIndicator color={STUDIO_COLORS.onPrimary} />
                  ) : (
                    <Text variant="body" style={styles.placeLabel}>
                      {t('studio.record.place')}
                    </Text>
                  )}
                </Pressable>
              </View>
              {take && (
                <Text variant="caption" style={styles.takeInfo}>
                  {t('studio.record.takeInfo', {
                    duration: formatClock(take.durationMs),
                    peak: Math.round(take.peakDb),
                  })}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Settings fold */}
        <Pressable
          onPress={() => setShowSettings((v) => !v)}
          accessibilityRole="button"
          style={styles.foldHeader}
        >
          <Text variant="small" style={styles.foldTitle}>
            {t('studio.record.settings')}
          </Text>
          {showSettings ? (
            <ChevronUp size={16} color={STUDIO_COLORS.textMuted} />
          ) : (
            <ChevronDown size={16} color={STUDIO_COLORS.textMuted} />
          )}
        </Pressable>
        {showSettings && (
          <View style={styles.settings}>
            <View style={styles.settingRow}>
              <Text variant="small" style={styles.settingLabel}>
                {t('studio.record.inputDevice')}
              </Text>
              <View style={styles.chips}>
                {inputs.map((port) => {
                  const active = port.id === selectedInput?.id;
                  return (
                    <Pressable
                      key={port.id}
                      onPress={() => {
                        void haptic('selection');
                        void setInput(port.id).then(refreshPorts);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text
                        variant="caption"
                        numberOfLines={1}
                        style={[styles.chipText, active && styles.chipTextActive]}
                      >
                        {port.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <View style={styles.settingRow}>
              <Text variant="small" style={styles.settingLabel}>
                {t('studio.record.outputDevice')}
              </Text>
              <Text variant="caption" style={styles.settingValue}>
                {outputs.map((o) => o.name).join(', ') || '…'}
              </Text>
            </View>
            <View style={styles.settingRow}>
              <Text variant="small" style={styles.settingLabel}>
                {t('studio.record.monitoring')}
              </Text>
              <Switch
                value={monitoring}
                onValueChange={setMonitoring}
                trackColor={{ true: STUDIO_COLORS.primary }}
                thumbColor={monitoring ? STUDIO_COLORS.onPrimary : undefined}
              />
            </View>
            <View style={styles.settingRow}>
              <Text variant="small" style={styles.settingLabel}>
                {t('studio.record.inputGain', { value: Math.round(inputGainDb) })}
              </Text>
              <NativeSlider
                style={styles.settingSlider}
                minimumValue={-24}
                maximumValue={24}
                step={1}
                value={inputGainDb}
                onValueChange={setInputGainDb}
                minimumTrackTintColor={STUDIO_COLORS.text}
                maximumTrackTintColor={STUDIO_COLORS.borderStrong}
                thumbTintColor={STUDIO_COLORS.text}
              />
            </View>
            <View style={styles.settingRow}>
              <Text variant="small" style={styles.settingLabel}>
                {t('studio.record.limiter')}
              </Text>
              <Switch
                value={limiter}
                onValueChange={setLimiter}
                trackColor={{ true: STUDIO_COLORS.primary }}
                thumbColor={limiter ? STUDIO_COLORS.onPrimary : undefined}
              />
            </View>
            {/* Locked while effects are being built: visible, off and inert. */}
            <View
              style={[styles.settingRow, MONITOR_REVERB_LOCKED && styles.settingLocked]}
            >
              <Text variant="small" style={styles.settingLabel}>
                {t('studio.record.reverb')}
                {MONITOR_REVERB_LOCKED ? `  ${t('studio.record.reverbSoon')}` : ''}
              </Text>
              <Switch
                value={reverb}
                onValueChange={setReverb}
                disabled={MONITOR_REVERB_LOCKED}
                trackColor={{ true: STUDIO_COLORS.primary }}
                thumbColor={reverb ? STUDIO_COLORS.onPrimary : undefined}
              />
            </View>
            {reverb && (
              <View style={styles.chips}>
                {REVERB_PRESETS.map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => {
                      void haptic('selection');
                      setReverbPreset(p);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: reverbPreset === p }}
                    style={[styles.chip, reverbPreset === p && styles.chipActive]}
                  >
                    <Text
                      variant="caption"
                      style={[
                        styles.chipText,
                        reverbPreset === p && styles.chipTextActive,
                      ]}
                    >
                      {t(
                        `studio.record.reverbPresets.${p}` as 'studio.record.reverbPresets.plate'
                      )}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
            <View style={styles.settingRow}>
              <Text variant="small" style={styles.settingLabel}>
                {t('studio.record.overdub')}
              </Text>
              <Switch
                value={overdub}
                onValueChange={setOverdub}
                trackColor={{ true: STUDIO_COLORS.primary }}
                thumbColor={overdub ? STUDIO_COLORS.onPrimary : undefined}
              />
            </View>
            <Text variant="caption" style={styles.hint}>
              {t('studio.record.headphonesHint')}
            </Text>
          </View>
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  settingLocked: {
    opacity: 0.32,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  clockLabel: {
    color: STUDIO_COLORS.textMuted,
    textAlign: 'center',
  },
  clock: {
    color: STUDIO_COLORS.text,
    fontSize: 54,
    // The base Text variant sets a 22 pt line height, which would clip this.
    lineHeight: 62,
    fontFamily: 'Archivo_700Bold',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    marginVertical: 6,
  },
  meterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  meterLabel: {
    width: 56,
    color: STUDIO_COLORS.textMuted,
  },
  meterTrack: {
    flex: 1,
    height: 10,
    borderRadius: 3,
    backgroundColor: STUDIO_COLORS.borderStrong,
    overflow: 'hidden',
  },
  meterFill: {
    height: 10,
    borderRadius: 3,
  },
  meterTick: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: STUDIO_COLORS.background,
  },
  error: {
    color: '#FF6B61',
    textAlign: 'center',
    marginTop: 10,
  },
  blocked: {
    color: STUDIO_COLORS.textMuted,
    textAlign: 'center',
    marginTop: 14,
  },
  retry: {
    alignSelf: 'center',
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: STUDIO_COLORS.borderStrong,
  },
  retryText: {
    color: STUDIO_COLORS.text,
  },
  transport: {
    marginTop: 22,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  recordButton: {
    height: 64,
    minWidth: 220,
    paddingHorizontal: 28,
    borderRadius: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: STUDIO_COLORS.record,
  },
  stopButton: {
    backgroundColor: STUDIO_COLORS.surfaceRaised,
    borderWidth: 1,
    borderColor: STUDIO_COLORS.record,
    minWidth: 180,
  },
  recordLabel: {
    color: STUDIO_COLORS.text,
    fontFamily: 'Archivo_700Bold',
    marginLeft: 10,
  },
  roundButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: STUDIO_COLORS.surfaceRaised,
    borderWidth: 1,
    borderColor: STUDIO_COLORS.borderStrong,
  },
  listen: {
    backgroundColor: STUDIO_COLORS.primary,
    borderColor: STUDIO_COLORS.primary,
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  review: {
    alignItems: 'center',
  },
  placeButton: {
    height: 52,
    paddingHorizontal: 22,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: STUDIO_COLORS.primary,
  },
  placeLabel: {
    color: STUDIO_COLORS.onPrimary,
    fontFamily: 'Archivo_700Bold',
  },
  takeInfo: {
    color: STUDIO_COLORS.textMuted,
    marginTop: 12,
  },
  foldHeader: {
    marginTop: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  foldTitle: {
    color: STUDIO_COLORS.text,
    fontFamily: 'Archivo_600SemiBold',
  },
  settings: {
    paddingBottom: 8,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  settingLabel: {
    color: STUDIO_COLORS.text,
    flexShrink: 0,
    marginRight: 12,
  },
  settingValue: {
    color: STUDIO_COLORS.textMuted,
    flex: 1,
    textAlign: 'right',
  },
  settingSlider: {
    flex: 1,
    height: 32,
  },
  chips: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
    paddingVertical: 4,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: STUDIO_COLORS.borderStrong,
    maxWidth: 160,
  },
  chipActive: {
    backgroundColor: STUDIO_COLORS.primary,
    borderColor: STUDIO_COLORS.primary,
  },
  chipText: {
    color: STUDIO_COLORS.text,
  },
  chipTextActive: {
    color: STUDIO_COLORS.onPrimary,
  },
  hint: {
    color: STUDIO_COLORS.textMuted,
    marginTop: 8,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.8,
  },
});
