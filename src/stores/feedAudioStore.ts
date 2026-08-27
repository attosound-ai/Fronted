/**
 * Single-audible-owner coordinator for the feed (build 160).
 *
 * WHY: feed AUDIO posts are started by tap (AudioMedia) and never stopped when
 * another media becomes audible; feed VIDEOS autoplay and share a global mute
 * (videoSoundStore) that starts muted. So the overlap the client filmed on Aug
 * 23 happened when a manually-playing audio post kept going while an UNMUTED
 * video autoplayed over it — two audio sources at once. Nothing coordinated the
 * two, and a second audio post could stack on the first the same way.
 *
 * This holds the ONE audio post allowed to sound at a time. Playing an audio
 * post claims ownership (stopping any previous one); a video that becomes
 * audible calls stopActive() to silence the audio post. Pure audibility
 * mutual-exclusion — videos are never paused (IG-style), so nothing visual is
 * disrupted.
 */
type Stopper = () => void;

let activeId: string | null = null;
let activeStopper: Stopper | null = null;

/** An audio post claims playback. Any previously-playing audio post is stopped. */
export function claimFeedAudio(id: string, stop: Stopper): void {
  if (activeId && activeId !== id && activeStopper) {
    const prev = activeStopper;
    activeStopper = null; // avoid re-entrancy if prev's pause fires a state change
    prev();
  }
  activeId = id;
  activeStopper = stop;
}

/** The owning audio post reports it stopped (paused/ended/unmounted). */
export function releaseFeedAudio(id: string): void {
  if (activeId === id) {
    activeId = null;
    activeStopper = null;
  }
}

/** Silence whatever feed audio is currently playing (called when a video becomes audible). */
export function stopActiveFeedAudio(): void {
  if (activeStopper) {
    const stop = activeStopper;
    activeId = null;
    activeStopper = null;
    stop();
  }
}
