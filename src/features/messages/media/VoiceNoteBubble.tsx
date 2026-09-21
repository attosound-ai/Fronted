import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { Pause, Play } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '@/constants/theme';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { useCallStore } from '@/stores/callStore';
import { reclaimAudioSession } from '@/hooks/useTwilioVoice';
import { useRegisterNowPlaying } from '@/lib/callAudio/useRegisterNowPlaying';
import { useCallPlayback } from '@/lib/callAudio/session/useCallPlayback';
import type { MessageMetadata } from '../types';

const BARS = 34;
const BAR_WIDTH = 2.5;
const BAR_GAP = 1.6;
// WhatsApp's wave is about 22 pt tall and shares its line with the speed
// chip; the duration and the message time live on the line below it.
const WAVE_HEIGHT = 22;
const RATES = [1, 1.5, 2] as const;

interface VoiceNoteBubbleProps {
  url: string;
  metadata: MessageMetadata | null | undefined;
  /** Own bubbles are white or gold: the controls turn dark. */
  onLight: boolean;
}

/**
 * WhatsApp and Telegram style voice note: round play button, the recorded
 * waveform (metered while recording) that fills as it plays, tap to seek,
 * duration or remaining time, and a speed chip (1x, 1.5x, 2x).
 *
 * Playback rides the same engine hook as the old player so a voice note can
 * still be transmitted into a live call.
 */
function VoiceNoteBubbleInner({ url, metadata, onLight }: VoiceNoteBubbleProps) {
  const { t } = useTranslation('messages');
  const engine = useCallPlayback(url, 'chat_audio', {
    type: 'file',
    kind: 'message',
    uri: url,
  });
  const engineMode = engine.engineMode;
  const player = useAudioPlayer(engineMode ? null : url, {
    keepAudioSessionActive: true,
  });
  const status = useAudioPlayerStatus(player);
  const [rateIndex, setRateIndex] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const waveWidth = useRef(0);

  const isPlaying = engineMode ? engine.isPlaying : status.playing;
  useRegisterNowPlaying({ kind: 'message', uri: url }, isPlaying);
  const knownDuration = metadata?.durationMs ?? 0;
  const duration = engineMode
    ? engine.durationMs || knownDuration
    : status.duration > 0
      ? status.duration * 1000
      : knownDuration;
  const position = engineMode ? engine.positionMs : status.currentTime * 1000;
  const progress = duration > 0 ? Math.min(1, position / duration) : 0;

  const statusError = (status as { error?: unknown }).error;
  useEffect(() => {
    if (statusError) setLoadError(true);
  }, [statusError]);

  const bars = useMemo(() => {
    const stored = metadata?.waveform ?? [];
    // A flat capture (no metering on this device, or silence) would draw a
    // row of identical dots: fall back to the generated shape instead.
    const wave = stored.length && Math.max(...stored) > 0.08 ? stored : null;
    if (wave) {
      const out: number[] = [];
      for (let i = 0; i < BARS; i++)
        out.push(wave[Math.floor((i * wave.length) / BARS)] ?? 0);
      return out;
    }
    // No metering (older client): a steady pseudo random pattern per url.
    let seed = 0;
    for (const ch of url) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    return Array.from({ length: BARS }, (_, i) => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return 0.25 + ((seed >> 8) % 60) / 100 + (i % 5 === 0 ? 0.1 : 0);
    });
  }, [metadata?.waveform, url]);

  const toggle = useCallback(async () => {
    analytics.capture(ANALYTICS_EVENTS.MESSAGES.MEDIA_OPENED, {
      kind: 'audio',
      action: isPlaying ? 'pause' : 'play',
      engine_mode: engineMode,
      rate: RATES[rateIndex],
    });
    if (engineMode) {
      void engine.toggle();
      return;
    }
    try {
      const call = useCallStore.getState().activeCall;
      const inCall = call?.state === 'connected' || call?.state === 'reconnecting';
      if (isPlaying) {
        player.pause();
        if (inCall) {
          await setAudioModeAsync({
            playsInSilentMode: true,
            allowsRecording: true,
            interruptionMode: 'mixWithOthers',
          });
          reclaimAudioSession();
        }
      } else {
        if (inCall) {
          await setAudioModeAsync({
            playsInSilentMode: true,
            allowsRecording: true,
            interruptionMode: 'mixWithOthers',
          });
        }
        player.setPlaybackRate(RATES[rateIndex]);
        player.play();
      }
    } catch {
      setLoadError(true);
    }
  }, [engine, engineMode, isPlaying, player, rateIndex]);

  const cycleRate = useCallback(() => {
    const next = (rateIndex + 1) % RATES.length;
    setRateIndex(next);
    if (!engineMode) player.setPlaybackRate(RATES[next]);
    analytics.capture(ANALYTICS_EVENTS.MESSAGES.MEDIA_OPENED, {
      kind: 'audio',
      action: 'rate',
      rate: RATES[next],
    });
  }, [engineMode, player, rateIndex]);

  const seekTo = useCallback(
    (x: number) => {
      if (waveWidth.current <= 0 || duration <= 0) return;
      const fraction = Math.max(0, Math.min(1, x / waveWidth.current));
      if (engineMode) void engine.seek(fraction * duration);
      else player.seekTo((fraction * duration) / 1000);
    },
    [duration, engine, engineMode, player]
  );

  const fg = onLight ? COLORS.black : COLORS.white;
  const dim = onLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.35)';
  const chipBg = onLight ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.16)';
  const shown = isPlaying ? Math.max(0, duration - position) : duration;

  if (loadError) {
    return (
      <Text style={[styles.time, { color: dim }]}>{t('media.audioUnavailable')}</Text>
    );
  }

  return (
    <View style={styles.row}>
      <Pressable
        onPress={toggle}
        style={[styles.play, { backgroundColor: fg }]}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? t('media.pause') : t('media.play')}
      >
        {isPlaying ? (
          <Pause
            size={16}
            color={onLight ? COLORS.white : COLORS.black}
            fill={onLight ? COLORS.white : COLORS.black}
          />
        ) : (
          <Play
            size={16}
            color={onLight ? COLORS.white : COLORS.black}
            fill={onLight ? COLORS.white : COLORS.black}
            style={styles.playGlyph}
          />
        )}
      </Pressable>
      <View style={styles.body}>
        <View style={styles.waveRow}>
          <Pressable
            style={styles.wave}
            onLayout={(e) => {
              waveWidth.current = e.nativeEvent.layout.width;
            }}
            onPress={(e) => seekTo(e.nativeEvent.locationX)}
            accessibilityRole="adjustable"
            accessibilityLabel={t('media.previewAudio')}
          >
            {bars.map((level, i) => {
              const played = (i + 0.5) / BARS <= progress;
              return (
                <View
                  key={i}
                  style={[
                    styles.bar,
                    {
                      height: Math.max(3, level * WAVE_HEIGHT),
                      backgroundColor: played ? fg : dim,
                    },
                  ]}
                />
              );
            })}
          </Pressable>
          <Pressable
            onPress={cycleRate}
            hitSlop={8}
            style={[styles.rate, { backgroundColor: chipBg }]}
            accessibilityRole="button"
            accessibilityLabel={t('media.speed')}
          >
            <Text style={[styles.rateText, { color: fg }]}>{RATES[rateIndex]}x</Text>
          </Pressable>
        </View>
        <Text style={[styles.time, { color: dim }]}>{formatTime(shown)}</Text>
      </View>
    </View>
  );
}

export const VoiceNoteBubble = memo(VoiceNoteBubbleInner);

function formatTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 1 },
  play: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playGlyph: { marginLeft: 2 },
  body: { gap: 1 },
  waveRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wave: {
    flexDirection: 'row',
    alignItems: 'center',
    height: WAVE_HEIGHT,
    gap: BAR_GAP,
    width: BARS * (BAR_WIDTH + BAR_GAP),
  },
  bar: { width: BAR_WIDTH, borderRadius: BAR_WIDTH / 2 },
  // The message time and ticks float over this line's right end, so the
  // duration keeps the left and nothing takes a line of its own.
  time: {
    fontSize: 11,
    fontFamily: 'Archivo_500Medium',
    fontVariant: ['tabular-nums'],
    marginTop: 1,
  },
  // WhatsApp's speed pill: a filled rounded rect, not a thin outline.
  rate: {
    minWidth: 34,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateText: { fontSize: 12, fontFamily: 'Archivo_700Bold' },
});
