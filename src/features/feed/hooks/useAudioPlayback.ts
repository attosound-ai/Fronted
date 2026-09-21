import { useEffect, useMemo, useState, useRef } from 'react';
import { useAudioPlayer, useAudioPlayerStatus, useAudioSampleListener } from 'expo-audio';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { markAction } from '@/lib/telemetry/actionMarks';
import type { CallPlaybackHandle } from '@/lib/callAudio/session/useCallPlayback';
const BAR_COUNT = 40;
const EMPTY_BARS: number[] = [];
const UPDATE_MS = 80; // ~12 fps

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Engine mode has no PCM tap on the JS side: shape the session's RMS level into
// a fixed bar pattern so the waveform still moves with the audio.
function engineBars(levelRms: number): number[] {
  return Array.from({ length: BAR_COUNT }, (_, i) =>
    Math.min(1, levelRms * 4 * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.7))))
  );
}

/**
 * `engine` is the surface's call playback handle. While `engine.engineMode` is
 * true (an engine call is latched) the expo player gets no source and every
 * control drives the native session instead; otherwise the hook behaves as it
 * always did and the handle is ignored.
 */
export function useAudioPlayback(url: string | undefined, engine?: CallPlaybackHandle) {
  const engineMode = engine?.engineMode === true;
  const player = useAudioPlayer(engineMode ? null : (url ?? null), {
    updateInterval: 200,
    keepAudioSessionActive: true,
  });
  const status = useAudioPlayerStatus(player);
  const [barAmplitudes, setBarAmplitudes] = useState<number[]>([]);
  const lastUpdateRef = useRef(0);

  // Real-time PCM amplitude → bar heights
  useAudioSampleListener(player, (sample) => {
    const now = Date.now();
    if (now - lastUpdateRef.current < UPDATE_MS) return;
    lastUpdateRef.current = now;

    const frames = sample.channels[0]?.frames;
    if (!frames || frames.length === 0) return;

    const chunk = Math.floor(frames.length / BAR_COUNT);
    if (chunk === 0) return;

    const amps = Array.from({ length: BAR_COUNT }, (_, i) => {
      let sum = 0;
      for (let j = i * chunk; j < (i + 1) * chunk; j++) sum += frames[j] * frames[j];
      return Math.min(Math.sqrt(sum / chunk) * 8, 1);
    });
    setBarAmplitudes(amps);
  });

  const displayAmplitudes = status.playing ? barAmplitudes : [];

  // Engine mode used to build a NEW bar array on every render, so the
  // waveform restarted all of its springs each time anything re rendered the
  // card. Quantize the level and memoize: the array only changes when the
  // level really moved, and an idle engine yields one stable empty array.
  const engineLevelStep =
    engineMode && engine?.isPlaying ? Math.round((engine.levelRms ?? 0) * 40) : -1;
  const engineAmplitudes = useMemo(
    () => (engineLevelStep < 0 ? EMPTY_BARS : engineBars(engineLevelStep / 40)),
    [engineLevelStep]
  );

  // Auto-reset when track finishes
  useEffect(() => {
    if (status.didJustFinish) {
      player.seekTo(0);
    }
  }, [status.didJustFinish, player]);

  if (engineMode && engine) {
    const durationMs = engine.durationMs;
    return {
      isPlaying: engine.isPlaying,
      isLoaded: engine.status !== 'preparing',
      isBuffering: engine.isPreparing,
      progress: durationMs > 0 ? engine.positionMs / durationMs : 0,
      currentTime: formatTime(engine.positionMs / 1000),
      duration: formatTime(durationMs / 1000),
      barAmplitudes: engineAmplitudes,
      togglePlayPause: () => {
        if (!engine.isPlaying) markAction('audio_play');
        analytics.capture(
          engine.isPlaying
            ? ANALYTICS_EVENTS.FEED.AUDIO_PAUSE
            : ANALYTICS_EVENTS.FEED.AUDIO_PLAY,
          { engine_mode: true, position_ms: Math.round(engine.positionMs) }
        );
        void engine.toggle();
      },
      pause: () => {
        void engine.pause();
      },
      seekToFraction: (fraction: number) => {
        if (durationMs > 0) void engine.seek(fraction * durationMs);
      },
      /** Jump by seconds, clamped to the track. Negative goes back. */
      seekBy: (seconds: number) => {
        if (durationMs <= 0) return;
        const next = Math.max(
          0,
          Math.min(durationMs, engine.positionMs + seconds * 1000)
        );
        void engine.seek(next);
      },
      durationSec: durationMs / 1000,
      currentSec: engine.positionMs / 1000,
    };
  }

  const togglePlayPause = () => {
    analytics.capture(
      status.playing
        ? ANALYTICS_EVENTS.FEED.AUDIO_PAUSE
        : ANALYTICS_EVENTS.FEED.AUDIO_PLAY,
      {
        engine_mode: false,
        position_ms: Math.round(status.currentTime * 1000),
        is_loaded: status.isLoaded,
      }
    );
    if (status.playing) {
      player.pause();
    } else {
      markAction('audio_play');
      player.play();
    }
  };

  const pause = () => {
    if (status.playing) player.pause();
  };

  const seekToFraction = (fraction: number) => {
    if (status.duration > 0) {
      player.seekTo(fraction * status.duration);
    }
  };

  /** Jump by seconds, clamped to the track. Negative goes back. */
  const seekBy = (seconds: number) => {
    if (status.duration <= 0) return;
    player.seekTo(Math.max(0, Math.min(status.duration, status.currentTime + seconds)));
  };

  return {
    isPlaying: status.playing,
    isLoaded: status.isLoaded,
    isBuffering: status.isBuffering,
    progress: status.duration > 0 ? status.currentTime / status.duration : 0,
    currentTime: formatTime(status.currentTime),
    duration: formatTime(status.duration),
    barAmplitudes: displayAmplitudes,
    togglePlayPause,
    pause,
    seekToFraction,
    seekBy,
    durationSec: status.duration,
    currentSec: status.currentTime,
  };
}
