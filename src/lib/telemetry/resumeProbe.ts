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

/** Call when AppState leaves 'active' so probeResume can measure suspension depth. */
export function markAppBackgrounded(): void {
  lastBackgroundAt = Date.now();
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
