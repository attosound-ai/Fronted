import { useCallback, useRef } from 'react';
import { View, Switch, TouchableOpacity, StyleSheet } from 'react-native';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import {
  Mic,
  Phone,
  Music2,
  Timer,
  Minus,
  Plus,
  Circle,
  Square,
  Play,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Slider } from '@/components/ui/Slider';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { haptic } from '@/lib/haptics/hapticService';
import { mixerService } from '@/lib/callAudio/mixerService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { useCallStore } from '@/stores/callStore';
import { useMixerStore, MIXER_CHANNELS, type MixerChannel } from '@/stores/mixerStore';
import { COLORS } from '@/constants/theme';

const CHANNEL_META: Record<MixerChannel, { label: string; Icon: typeof Mic }> = {
  mic: { label: 'Mi micrófono', Icon: Mic },
  remote: { label: 'La otra persona', Icon: Phone },
  app: { label: 'Audio del app', Icon: Music2 },
  metronome: { label: 'Metrónomo', Icon: Timer },
};

interface MixerSheetProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * MixerSheet — the in-call recording mixer. Per-channel record-enable + gain for
 * the four sources (mic / remote / injected app audio / metronome), a metronome
 * on-off + BPM, and a record button for the client-side multitrack. Affects ONLY
 * the recorded mix; the live call is untouched. Every change is reflected to the
 * native engine via mixerService (no-op until the native mixer ships).
 */
export function MixerSheet({ visible, onClose }: MixerSheetProps) {
  const channels = useMixerStore((s) => s.channels);
  const metronomeEnabled = useMixerStore((s) => s.metronomeEnabled);
  const bpm = useMixerStore((s) => s.bpm);
  const isMixRecording = useMixerStore((s) => s.isMixRecording);
  const setChannelGain = useMixerStore((s) => s.setChannelGain);
  const setChannelRecord = useMixerStore((s) => s.setChannelRecord);
  const setMetronomeEnabled = useMixerStore((s) => s.setMetronomeEnabled);
  const setBpm = useMixerStore((s) => s.setBpm);
  const setMixRecording = useMixerStore((s) => s.setMixRecording);
  const lastMixPath = useMixerStore((s) => s.lastMixPath);
  const setLastMixPath = useMixerStore((s) => s.setLastMixPath);
  const mixPlayerRef = useRef<AudioPlayer | null>(null);

  // Mirror a channel change to BOTH the store and the native bus.
  const onGain = useCallback(
    (ch: MixerChannel, gain: number) => {
      setChannelGain(ch, gain);
      mixerService.setChannel(ch, gain, channels[ch].record);
    },
    [setChannelGain, channels]
  );

  const onRecord = useCallback(
    (ch: MixerChannel, record: boolean) => {
      void haptic('selection');
      setChannelRecord(ch, record);
      mixerService.setChannel(ch, channels[ch].gain, record);
    },
    [setChannelRecord, channels]
  );

  const onMetronome = useCallback(
    (on: boolean) => {
      void haptic('selection');
      setMetronomeEnabled(on);
      mixerService.setMetronome(on, bpm);
      analytics.capture(ANALYTICS_EVENTS.CALL.AUDIO_MIX_METRONOME, { enabled: on, bpm });
    },
    [setMetronomeEnabled, bpm]
  );

  const onBpm = useCallback(
    (next: number) => {
      void haptic('selection');
      setBpm(next);
      mixerService.setMetronome(metronomeEnabled, next);
    },
    [setBpm, metronomeEnabled]
  );

  const onToggleRecording = useCallback(async () => {
    void haptic('medium');
    // Snapshot what the rep was mixing — the native record path is otherwise a
    // blind spot, so the result + config captured here is the only JS signal.
    const ctx = {
      call_sid: useCallStore.getState().activeCall?.callSid ?? null,
      channels,
      metronome_enabled: metronomeEnabled,
      bpm,
      native_supported: mixerService.isSupported(),
    };
    if (isMixRecording) {
      setMixRecording(false);
      const path = await mixerService.stopMixRecording();
      if (path) setLastMixPath(path);
      analytics.capture(ANALYTICS_EVENTS.CALL.AUDIO_MIX_RECORD, {
        ...ctx,
        action: 'stop',
        outcome: path ? 'ok' : 'no_path',
        has_path: !!path,
      });
    } else {
      setLastMixPath(null);
      setMixRecording(true);
      const res = await mixerService.startMixRecording();
      analytics.capture(ANALYTICS_EVENTS.CALL.AUDIO_MIX_RECORD, {
        ...ctx,
        action: 'start',
        outcome: res != null ? 'ok' : 'native_unavailable',
      });
    }
  }, [isMixRecording, setMixRecording, setLastMixPath, channels, metronomeEnabled, bpm]);

  // Play the finished mix locally so the rep can review the multitrack. Uses
  // keepAudioSessionActive so reviewing during a live call doesn't drop it.
  const playLastMix = useCallback(() => {
    if (!lastMixPath) return;
    void haptic('selection');
    analytics.capture(ANALYTICS_EVENTS.CALL.AUDIO_MIX_PLAYBACK, { has_path: true });
    try {
      mixPlayerRef.current?.remove();
      const player = createAudioPlayer(lastMixPath, { keepAudioSessionActive: true });
      mixPlayerRef.current = player;
      player.play();
    } catch {
      // best-effort
    }
  }, [lastMixPath]);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Mezclador">
      <View style={styles.body}>
        <Text style={styles.sectionLabel}>Canales de grabación</Text>
        {MIXER_CHANNELS.map((ch) => {
          const meta = CHANNEL_META[ch];
          const state = channels[ch];
          return (
            <View key={ch} style={styles.channelRow}>
              <View style={styles.channelHead}>
                <View style={styles.channelLabel}>
                  <meta.Icon
                    size={18}
                    color={state.record ? COLORS.primary : '#666'}
                    strokeWidth={2.25}
                  />
                  <Text
                    style={[styles.channelName, !state.record && styles.channelNameOff]}
                  >
                    {meta.label}
                  </Text>
                </View>
                <Switch
                  value={state.record}
                  onValueChange={(v) => onRecord(ch, v)}
                  trackColor={{ false: '#333', true: COLORS.primary }}
                  thumbColor="#FFF"
                />
              </View>
              <Slider
                value={state.gain}
                onChange={(v) => onGain(ch, v)}
                disabled={!state.record}
                minimumTrackColor={COLORS.primary}
              />
            </View>
          );
        })}

        <View style={styles.divider} />

        <View style={styles.metroHead}>
          <View style={styles.channelLabel}>
            <Timer
              size={18}
              color={metronomeEnabled ? COLORS.primary : '#666'}
              strokeWidth={2.25}
            />
            <Text style={styles.channelName}>Metrónomo</Text>
          </View>
          <Switch
            value={metronomeEnabled}
            onValueChange={onMetronome}
            trackColor={{ false: '#333', true: COLORS.primary }}
            thumbColor="#FFF"
          />
        </View>
        <View style={styles.bpmRow}>
          <Text style={styles.bpmLabel}>BPM</Text>
          <TouchableOpacity
            style={styles.bpmBtn}
            onPress={() => onBpm(bpm - 1)}
            disabled={!metronomeEnabled}
          >
            <Minus
              size={18}
              color={metronomeEnabled ? '#FFF' : '#555'}
              strokeWidth={2.5}
            />
          </TouchableOpacity>
          <Text style={[styles.bpmValue, !metronomeEnabled && styles.bpmValueOff]}>
            {bpm}
          </Text>
          <TouchableOpacity
            style={styles.bpmBtn}
            onPress={() => onBpm(bpm + 1)}
            disabled={!metronomeEnabled}
          >
            <Plus
              size={18}
              color={metronomeEnabled ? '#FFF' : '#555'}
              strokeWidth={2.5}
            />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.recordBtn, isMixRecording && styles.recordBtnActive]}
          onPress={onToggleRecording}
          activeOpacity={0.85}
        >
          {isMixRecording ? (
            <Square size={18} color="#FFF" fill="#FFF" strokeWidth={2.25} />
          ) : (
            <Circle size={18} color="#FFF" fill="#EF4444" strokeWidth={2.25} />
          )}
          <Text style={styles.recordBtnText}>
            {isMixRecording ? 'Detener mezcla' : 'Grabar mezcla'}
          </Text>
        </TouchableOpacity>

        {lastMixPath && !isMixRecording ? (
          <TouchableOpacity
            style={styles.playMixBtn}
            onPress={playLastMix}
            activeOpacity={0.85}
          >
            <Play size={16} color="#FFF" fill="#FFF" strokeWidth={2.25} />
            <Text style={styles.playMixText}>Escuchar mezcla</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 18,
    paddingBottom: 8,
    gap: 4,
  },
  sectionLabel: {
    color: '#888',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  channelRow: {
    paddingVertical: 6,
  },
  channelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  channelLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  channelName: {
    color: '#FFF',
    fontFamily: 'Archivo_500Medium',
    fontSize: 15,
  },
  channelNameOff: {
    color: '#666',
  },
  divider: {
    height: 1,
    backgroundColor: '#222',
    marginVertical: 12,
  },
  metroHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bpmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 10,
    marginBottom: 4,
  },
  bpmLabel: {
    color: '#888',
    fontFamily: 'Archivo_500Medium',
    fontSize: 14,
    flex: 1,
  },
  bpmBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1F1F1F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bpmValue: {
    color: '#FFF',
    fontFamily: 'Archivo_700Bold',
    fontSize: 22,
    minWidth: 56,
    textAlign: 'center',
  },
  bpmValueOff: {
    color: '#555',
  },
  recordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#1F1F1F',
    borderRadius: 16,
    paddingVertical: 16,
    marginTop: 18,
  },
  recordBtnActive: {
    backgroundColor: 'rgba(239,68,68,0.25)',
  },
  recordBtnText: {
    color: '#FFF',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 16,
  },
  playMixBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    marginTop: 10,
  },
  playMixText: {
    color: '#FFF',
    fontFamily: 'Archivo_500Medium',
    fontSize: 15,
  },
});
