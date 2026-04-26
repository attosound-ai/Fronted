import { useEffect, useState, useRef } from 'react';
import {
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioSampleListener,
} from 'expo-audio';
const BAR_COUNT = 40;
const UPDATE_MS = 80; // ~12 fps

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function useAudioPlayback(url: string | undefined) {
  const player = useAudioPlayer(url ?? null, {
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

  // Auto-reset when track finishes
  useEffect(() => {
    if (status.didJustFinish) {
      player.seekTo(0);
    }
  }, [status.didJustFinish, player]);

  const togglePlayPause = () => {
    if (status.playing) {
      player.pause();
    } else {
      player.play();
    }
  };

  const seekToFraction = (fraction: number) => {
    if (status.duration > 0) {
      player.seekTo(fraction * status.duration);
    }
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
    seekToFraction,
  };
}
