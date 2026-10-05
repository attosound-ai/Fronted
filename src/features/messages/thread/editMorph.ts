export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** How far the bubble may sit from the field and still fly into it. */
const MAX_DY = 160;

/**
 * Where the edit field starts so that it covers the bubble it replaces:
 * `left` is how much narrower it starts on its left side (own bubbles hug the
 * right edge, as the field does), `dy` how far above or below its final place.
 * A bubble far from the composer does not fly across the screen: past MAX_DY
 * the field only stretches, in place.
 */
export function morphStart(bubble: Box, field: Box): { left: number; dy: number } {
  const left = Math.max(0, Math.min(field.width - 44, bubble.x - field.x));
  const rawDy = bubble.y + bubble.height / 2 - (field.y + field.height / 2);
  const dy = Math.abs(rawDy) > MAX_DY ? 0 : rawDy;
  return { left: Number.isFinite(left) ? left : 0, dy: Number.isFinite(dy) ? dy : 0 };
}
