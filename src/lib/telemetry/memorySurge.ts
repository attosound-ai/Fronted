/**
 * Memory surge detector: a jump between two samples far beyond normal use.
 * Reported with the screen and the recent actions so the leaking surface
 * names itself (the Sep 20 2026 freeze grew 400 MB every 30 s and nothing
 * flagged it). Pure apart from remembering the previous sample.
 */

/** Growth between two samples that no normal screen produces. */
export const MEMORY_SURGE_MB = 150;

let lastMemMB: number | null = null;

/** Feed every sample through here. Returns the growth in MB on a surge, else null. */
export function memorySurgeMB(sampleMB: number | null | undefined): number | null {
  if (typeof sampleMB !== 'number' || !Number.isFinite(sampleMB)) return null;
  const previous = lastMemMB;
  lastMemMB = sampleMB;
  if (previous === null) return null;
  const growth = sampleMB - previous;
  return growth >= MEMORY_SURGE_MB ? Math.round(growth) : null;
}

export function resetMemorySurge(): void {
  lastMemMB = null;
}
