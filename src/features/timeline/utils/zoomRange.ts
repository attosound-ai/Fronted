/**
 * How far in and how far out the timeline may be zoomed.
 *
 * Pure on purpose (no React, no react-native): the reducer, the toolbar, the
 * editor's pinch worklet and the unit tests all need these same numbers, and
 * a control that clamps differently from the reducer asks for a zoom the
 * timeline will never show.
 */

// The ONE definition of the zoom range. The reducer clamps to it, and the
// toolbar's detents/slider and the editor's pinch preview must use the same
// symbols, or a control can ask for a level the timeline will not show.
//
// ZOOM_MIN is the floor for a project that already fits on screen: 10 px per
// second, about 28 seconds across the lane area. It is NOT the floor for a
// long one. Anthony, Sep 28 2026: "we still can't zoom out enough to see an
// entire track or album". A 35 minute project at 10 px per second is 21,000
// points wide, seventy screens, and no amount of tapping the minus button
// reached the end because the button stopped here. So the real floor is
// whatever shows the WHOLE project (see `zoomFloorFor`), and this constant is
// only the floor when the project is shorter than that.
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 4;
/**
 * The absolute floor, 0.02 px per second: one point is 50 seconds, so a three
 * hour project still fits in 216 points. It exists so a corrupt duration (or a
 * division that went to zero) can never ask for a zoom that makes the whole
 * timeline a single pixel.
 */
export const ZOOM_FLOOR = 0.0002;

export function clampZoom(level: number): number {
  // Callable from the pinch gesture's UI-thread worklet. A plain function
  // reference is NOT callable on the UI runtime; calling it is the same fatal
  // jsi JSError that killed build 169 mid-call (Sentry REACT-NATIVE-4W).
  'worklet';
  if (!Number.isFinite(level)) return ZOOM_MIN;
  return Math.max(ZOOM_FLOOR, Math.min(ZOOM_MAX, level));
}

/**
 * The zoom at which `durationMs` spans exactly `usableWidthPx` points: the
 * whole project, end to end, with nothing cut off.
 *
 * `usableWidthPx` is the lane area, so the caller subtracts the track panels
 * on the left. Returns ZOOM_MAX for a project with no length yet, because
 * "fit nothing" has no meaning and the caller would otherwise divide by zero.
 */
export function fitZoomFor(durationMs: number, usableWidthPx: number): number {
  'worklet';
  if (!Number.isFinite(durationMs) || durationMs <= 0) return ZOOM_MAX;
  if (!Number.isFinite(usableWidthPx) || usableWidthPx <= 0) return ZOOM_MAX;
  // 100 px per second at zoom 1 (PIXELS_PER_SECOND_AT_ZOOM_1).
  const level = (usableWidthPx * 1000) / (durationMs * 100);
  return Math.max(ZOOM_FLOOR, Math.min(ZOOM_MAX, level));
}

/**
 * How far out this project may be zoomed. Never past the point where it all
 * fits on screen, and never coarser than ZOOM_MIN, so a project that already
 * fits keeps exactly the range it has always had.
 */
export function zoomFloorFor(durationMs: number, usableWidthPx: number): number {
  'worklet';
  return Math.min(ZOOM_MIN, fitZoomFor(durationMs, usableWidthPx));
}

