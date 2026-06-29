import { create } from 'zustand';
import type { InjectSource } from '@/lib/callAudio/AudioInjector';

/**
 * nowPlayingStore — the track the user is currently / was last playing in the
 * feed or reels, as an {@link InjectSource}. This is what the GENERAL "transmit
 * into call" button in the in-call bar injects: the rep plays any post / reel /
 * beat in the app, then taps the call-bar button to push THAT audio into the
 * live call. Decoupled from any single post so the button is global, not per-card.
 *
 * Feed/reel audio players call setNowPlaying when they start; it persists (as the
 * last-played track) so the button always has something to transmit.
 */

interface NowPlayingState {
  track: InjectSource | null;
  setNowPlaying: (track: InjectSource) => void;
  clearNowPlaying: () => void;
}

export const useNowPlayingStore = create<NowPlayingState>((set) => ({
  track: null,
  setNowPlaying: (track) => set({ track }),
  clearNowPlaying: () => set({ track: null }),
}));
