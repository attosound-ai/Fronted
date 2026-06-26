import { useEffect, useState } from 'react';
import type { VideoPlayer } from 'expo-video';

/**
 * useVideoProgress — tracks playback position + duration for a video player so
 * the UI can render a time readout and a progress bar.
 *
 * Uses expo-video's `timeUpdate` event (driven by `timeUpdateEventInterval`)
 * rather than a manual interval, so updates stay in sync with the player and
 * pause automatically when the video is paused.
 */
export function useVideoProgress(player: VideoPlayer | null): {
  position: number;
  duration: number;
} {
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!player) return;

    // Emit a timeUpdate ~4x/second — smooth bar without excessive re-renders.
    try {
      player.timeUpdateEventInterval = 0.25;
    } catch {
      // older runtimes may not expose the setter — listener still fires on play
    }

    const readDuration = () => {
      const d = player.duration;
      if (Number.isFinite(d) && d > 0) setDuration(d);
    };
    readDuration();

    const timeSub = player.addListener('timeUpdate', (e: { currentTime: number }) => {
      setPosition(e.currentTime ?? 0);
      if (!duration) readDuration();
    });
    const statusSub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') readDuration();
    });

    return () => {
      timeSub.remove();
      statusSub.remove();
    };
    // `duration` intentionally omitted — listeners read it via closure-free setter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  return { position, duration };
}

/** Format seconds as `m:ss` (e.g. 73 → "1:13"). */
export function formatVideoTime(seconds: number): string {
  const s = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}
