import { useEffect } from 'react';

import { useNowPlayingStore } from '@/stores/nowPlayingStore';
import type { InjectSource } from './AudioInjector';

/**
 * useRegisterNowPlaying — the single way ANY player in the app registers what it
 * is currently playing, so the in-call "transmit" (📡) button can push THAT audio
 * into the live call. Every audio/video player calls this with its source + play
 * state: feed audio posts, reels, video posts, beats, the Record Pro track editor,
 * chat audio/video — anything that makes sound.
 *
 * Last-started wins: the rep taps 📡 to transmit whatever they're listening to.
 * No-op until something plays. For video sources pass `isVideo: true` so the
 * injector knows to extract the audio track before playing it into the call.
 */
export function useRegisterNowPlaying(
  source: InjectSource | null | undefined,
  isPlaying: boolean
): void {
  const setNowPlaying = useNowPlayingStore((s) => s.setNowPlaying);
  const uri = source?.uri;
  useEffect(() => {
    if (isPlaying && source && uri) {
      setNowPlaying(source);
    }
    // Re-register only when the playing track or its play state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, uri, setNowPlaying]);
}
