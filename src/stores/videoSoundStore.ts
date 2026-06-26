import { create } from 'zustand';

/**
 * Global mute state shared by every video surface — feed videos, reels, and ad
 * reels. Instagram-style: muting or unmuting one video applies to all of them.
 *
 * Kept in memory only (no persistence): sound resets to muted on each app
 * launch, which matches how IG/TikTok behave and avoids autoplaying audio on a
 * cold start.
 */
interface VideoSoundState {
  /** True = all videos play silently. Starts muted. */
  isMuted: boolean;
  /** Flip the shared mute state (used by every in-video sound button). */
  toggleMuted: () => void;
  /** Force a specific mute state. */
  setMuted: (muted: boolean) => void;
}

export const useVideoSoundStore = create<VideoSoundState>((set) => ({
  isMuted: true,
  toggleMuted: () => set((state) => ({ isMuted: !state.isMuted })),
  setMuted: (isMuted) => set({ isMuted }),
}));
