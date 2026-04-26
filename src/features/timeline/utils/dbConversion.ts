/**
 * Conversion helpers between linear audio amplitude (0..1) and decibels.
 *
 * Linear is what audio APIs expose on GainNode / player.volume.
 * Decibels is what audio engineers (and our mixer UI) think in.
 */

/** Convert decibels to a linear multiplier. `0 dB` → `1.0`. */
export function dbToLinear(db: number): number {
  if (db === -Infinity) return 0;
  return Math.pow(10, db / 20);
}

/** Convert a linear multiplier to decibels. `0` → `-Infinity`. */
export function linearToDb(linear: number): number {
  if (linear <= 0) return -Infinity;
  return 20 * Math.log10(linear);
}

/** Minimum dB we display — below this is treated as silence. */
export const DB_MIN = -60;

/** Maximum dB boost we allow — keeps the UI slider sane. */
export const DB_MAX = 12;

/** Clamp a dB value to the UI range. */
export function clampDb(db: number): number {
  if (!isFinite(db)) return DB_MIN;
  return Math.max(DB_MIN, Math.min(DB_MAX, db));
}

/** Format a dB value for display, e.g. `+6.0 dB`, `-12.0 dB`, `0 dB`. */
export function formatDb(db: number): string {
  if (db <= DB_MIN) return '-∞ dB';
  if (db === 0) return '0 dB';
  const sign = db > 0 ? '+' : '';
  return `${sign}${db.toFixed(1)} dB`;
}
