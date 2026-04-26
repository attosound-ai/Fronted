/**
 * Pure mixer math for multi-track audio playback.
 *
 * Given a clip's base volume and the parent lane's mixer state,
 * compute the effective linear multiplier that should drive the
 * audio engine's GainNode for that lane.
 *
 * This function is intentionally stateless and side-effect free —
 * it exists so the business rules for mute/solo/gain can be unit
 * tested in isolation from the audio library and from React state.
 */

import { dbToLinear, DB_MIN } from './dbConversion';

export interface LaneMixState {
  /** Base clip volume, 0..1. */
  clipVolume: number;
  /** Lane gain in dB (default 0). */
  laneGainDb: number;
  /** Whether this lane has its mute button on. */
  laneMuted: boolean;
  /** Whether this lane has its solo button on. */
  laneSolo: boolean;
  /** Whether any lane (including this one) is currently soloed. */
  anyLaneSoloed: boolean;
}

/**
 * Rules (match how Logic / Ableton / ProTools behave):
 *
 * 1. If the lane is muted → effective volume is 0.
 * 2. If any lane is soloed and this lane is NOT soloed → effective volume is 0.
 * 3. Otherwise → `clipVolume * dbToLinear(gainDb)`.
 *    Solo does NOT add extra gain — it only mutes the others.
 * 4. If the resulting gain is below the minimum dB floor, return 0 to avoid
 *    sub-audible leakage.
 */
export function computeLaneEffectiveVolume(state: LaneMixState): number {
  if (state.laneMuted) return 0;
  if (state.anyLaneSoloed && !state.laneSolo) return 0;

  const gainLinear = dbToLinear(state.laneGainDb);
  const effective = state.clipVolume * gainLinear;

  // Silence floor — anything below -60 dB is effectively silent.
  if (effective < dbToLinear(DB_MIN)) return 0;
  return effective;
}

/**
 * Check if any lane in the given metadata map has `solo: true`.
 * Callers pass the result to `computeLaneEffectiveVolume` so the
 * solo rule can be applied consistently across all lanes in a frame.
 */
export function hasAnySoloedLane(
  laneMeta: Record<number, { solo?: boolean } | undefined>
): boolean {
  for (const key in laneMeta) {
    if (laneMeta[key]?.solo) return true;
  }
  return false;
}
