/**
 * The size of a photo or a video in the thread, from its real proportions,
 * the way WhatsApp does it: a vertical video is a tall bubble, a horizontal
 * one a wide bubble, and nothing is cropped to a fixed 16:9 strip (which is
 * what every chat video used to be, so a 9:16 clip showed only its middle).
 *
 * Extreme shapes are held back so a panorama or a very long screenshot cannot
 * take over the thread.
 */
export interface Box {
  width: number;
  height: number;
}

/** Narrowest (9:18) and widest (2:1) shapes shown as they are. */
export const MIN_ASPECT = 0.5;
export const MAX_ASPECT = 2;
/** What a video looked like before its size was known: kept as the fallback. */
export const DEFAULT_ASPECT = 16 / 9;

/** width / height when both are real numbers, otherwise null. */
export function aspectOf(
  width: number | null | undefined,
  height: number | null | undefined
): number | null {
  if (typeof width !== 'number' || typeof height !== 'number') return null;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;
  return width / height;
}

export function mediaBox(
  aspect: number | null,
  maxWidth: number,
  maxHeight: number
): Box {
  const a = Math.max(MIN_ASPECT, Math.min(MAX_ASPECT, aspect ?? DEFAULT_ASPECT));
  // As wide as the bubble allows; a tall one that would run past the height
  // limit is narrowed instead, keeping its shape.
  let width = maxWidth;
  let height = width / a;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * a;
  }
  return { width: Math.round(width), height: Math.round(height) };
}
