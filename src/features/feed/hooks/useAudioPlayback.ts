import { useEffect } from 'react';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function useAudioPlayback(url: string | undefined) {
  const player = useAudioPlayer(url ?? null, { updateInterval: 200 });
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true });
  }, []);

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
    togglePlayPause,
    seekToFraction,
  };
}
