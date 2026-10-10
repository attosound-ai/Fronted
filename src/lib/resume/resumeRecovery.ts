/**
 * What to do when the app comes back after a long background (Oct 10 2026).
 *
 * It used to remount everything on every return over 2 min, to cure a June black
 * screen that was never measured; that threw away the user's screen and drafts,
 * killed an upload's Live Activity, and rebuilt video players in the middle of
 * calls (the silent Larry call). Now the window is measured and the remount is the
 * last resort only:
 *
 *   healthy window                  -> nothing (the caller refreshes stale data)
 *   dark window, healthy after a repaint -> repainted
 *   dark even after the repaint      -> remount, unless a call is live or a modal
 *                                       is presented (then held, and reported)
 *   no measurement possible          -> nothing, reported as unmeasured
 *
 * "Dark" means the measurement worked and found zero bright pixels: ATTO's
 * background is pure black and every healthy screen has white text or icons
 * somewhere, so a dark photo with a close button is not dark. A false "dark"
 * costs one repaint, never the user's place, unless the repaint also reads zero.
 *
 * Pure (no React Native imports) so it runs under `node --test`.
 */

export interface WindowHealth {
  hasWindow: boolean;
  drew?: boolean;
  samples?: number;
  brightPixels?: number;
  brightFraction?: number;
}

export type ResumeAction =
  | 'not_needed'
  | 'repainted'
  | 'held'
  | 'last_resort'
  | 'unmeasured';

export interface ResumeDecision {
  action: ResumeAction;
  holdReason: 'call_live' | 'modal_open' | null;
}

/** Measured, drawn, and not a single bright pixel. */
export function isDark(h: WindowHealth | null | undefined): boolean {
  return (
    h != null &&
    h.hasWindow === true &&
    h.drew === true &&
    (h.samples ?? 0) > 0 &&
    h.brightPixels === 0
  );
}

function measured(h: WindowHealth | null | undefined): boolean {
  return h != null && h.hasWindow === true && h.drew === true && (h.samples ?? 0) > 0;
}

export function decideResumeRecovery(input: {
  first: WindowHealth | null;
  afterRepaint: WindowHealth | null;
  callLive: boolean;
  modal: string | null;
}): ResumeDecision {
  const { first, afterRepaint, callLive, modal } = input;
  if (!measured(first)) return { action: 'unmeasured', holdReason: null };
  if (!isDark(first)) return { action: 'not_needed', holdReason: null };
  if (measured(afterRepaint) && !isDark(afterRepaint))
    return { action: 'repainted', holdReason: null };
  if (!measured(afterRepaint)) return { action: 'unmeasured', holdReason: null };
  if (callLive) return { action: 'held', holdReason: 'call_live' };
  if (modal) return { action: 'held', holdReason: 'modal_open' };
  return { action: 'last_resort', holdReason: null };
}
