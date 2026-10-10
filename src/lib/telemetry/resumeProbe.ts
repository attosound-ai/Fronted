import { analytics } from '@/lib/analytics';

/**
 * Resume-render diagnostics for the deep-suspension black screen.
 *
 * Build-56 telemetry proved the JS thread + AppState handlers run fine on a
 * deep "phone off" resume (ticks + call_resume_surface_snapshot keep firing)
 * yet the native surface renders BLACK — so the existing (all JS-side) events
 * cannot tell a black resume from a healthy one. This adds the one signal that
 * can: whether the compositor actually produced a frame after resume.
 *
 * `requestAnimationFrame` is driven by the iOS display link on the UI thread.
 * If a timer fires on resume but rAF does NOT (raf_fired=false), the UI/compositor
 * isn't producing frames — the fingerprint of a purged drawable / dark surface.
 * If rAF fires promptly, the surface is compositing and any "black" is content,
 * not the surface. `ms_since_background` captures suspension depth (deep phone-off
 * vs shallow lock), the discriminator between the working and broken cases.
 *
 * Pure JS — ships over-the-air.
 */

let lastBackgroundAt: number | null = null;

/** A return after this long in the background is a deep resume (refresh, measure). */
export const DEEP_RESUME_MS = 120_000;

/** Call when AppState leaves 'active' so probeResume can measure suspension depth. */
export function markAppBackgrounded(): void {
  lastBackgroundAt = Date.now();
}

/** Elapsed ms since the app last left 'active' (null if it never backgrounded).
 *  Used to gate the deep-resume remount: only a long suspension purges GPU
 *  content, so we only pay the remount cost when it's actually warranted. */
export function msSinceBackground(): number | null {
  return lastBackgroundAt != null ? Date.now() - lastBackgroundAt : null;
}

let lastResumeAt: number | null = null;
let deepRemounts = 0;
let lastDeepRemountAt: number | null = null;
let lastRouteLostToRemount: string | null = null;

/** Call when AppState returns to 'active'. */
export function markAppResumed(): void {
  lastResumeAt = Date.now();
}

/** Call when the deep resume remount runs, with the screen it throws away. */
export function markDeepRemount(routeBefore: string | null): void {
  deepRemounts += 1;
  lastDeepRemountAt = Date.now();
  lastRouteLostToRemount = routeBefore;
}

/**
 * Where this run stands relative to the last resume and the last deep remount,
 * for events that need to say whether a remount came before them.
 */
export function resumeContext(): Record<string, unknown> {
  const now = Date.now();
  return {
    ms_since_resume: lastResumeAt != null ? now - lastResumeAt : null,
    deep_remounts_this_run: deepRemounts,
    ms_since_deep_remount: lastDeepRemountAt != null ? now - lastDeepRemountAt : null,
    route_lost_to_remount: lastRouteLostToRemount,
  };
}

/**
 * Schedule a one-shot resume probe and emit `eventName` ~300ms after resume with
 * the compositor-liveness signal merged into `props`.
 */
export function probeResume(
  eventName: string,
  props: Record<string, unknown> = {}
): void {
  const t0 = Date.now();
  const msSinceBackground = lastBackgroundAt != null ? t0 - lastBackgroundAt : null;
  let rafMs: number | null = null;
  try {
    requestAnimationFrame(() => {
      rafMs = Date.now() - t0;
    });
  } catch {
    // requestAnimationFrame should always exist in RN; guard defensively.
  }
  setTimeout(() => {
    analytics.capture(eventName, {
      ...props,
      ms_since_background: msSinceBackground,
      raf_ms: rafMs,
      // raf_fired=false within the window ⇒ compositor stalled ⇒ dark surface.
      raf_fired: rafMs != null,
    });
  }, 300);
}
