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

// ── Gain slider mapping ──────────────────────────────────────────────────
// The range is lopsided (60 dB of cut, 12 dB of boost), so a linear slider
// parks 0 dB at 83 percent of its travel. Mixers put unity in the middle:
// the left half of the travel covers DB_MIN..0 and the right half 0..DB_MAX.

/** Half width of the zone around the middle that snaps to exactly 0 dB. */
export const GAIN_CENTER_SNAP = 0.02;

/** Slider position (0..1) for a gain in dB, with 0 dB at 0.5. */
export function gainDbToSlider(db: number): number {
  const d = clampDb(db);
  if (d <= 0) return 0.5 * (1 - d / DB_MIN);
  return 0.5 + 0.5 * (d / DB_MAX);
}

/** Gain in dB for a slider position (0..1). The middle snaps to unity. */
export function sliderToGainDb(position: number): number {
  const p = Math.max(0, Math.min(1, Number.isFinite(position) ? position : 0.5));
  // The epsilon keeps the edge of the zone inside it despite float rounding.
  if (Math.abs(p - 0.5) <= GAIN_CENTER_SNAP + 1e-9) return 0;
  if (p < 0.5) return clampDb(DB_MIN * (1 - p / 0.5));
  return clampDb(DB_MAX * ((p - 0.5) / 0.5));
}
