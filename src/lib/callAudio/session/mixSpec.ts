/**
 * Pure builders for the stem specs the native engine plays during a call.
 * No React Native imports: unit tested under node (see __tests__/mixSpec.test.ts).
 *
 * A stem is one lane of the timeline rendered to a single file of the whole
 * timeline's length, with each clip's OWN volume, trims and position baked in.
 * Lane mute, solo and gainDb are NOT baked: they become the stem's live gain so
 * a fader move is a volume write, never a re render. When the timeline has more
 * lanes than the engine's pool, the overflow lanes are summed into the last stem
 * and their lane state is baked there instead (exact mix, fader not live).
 */

// Relative on purpose: this module runs under plain node in the unit tests,
// where the `@/` alias does not resolve.
import {
  computeLaneEffectiveVolume,
  hasAnySoloedLane,
} from '../../../features/timeline/utils/laneMixer';
import { STEM_COUNT, type StemClip, type StemSource } from './types';

export const CANONICAL_RATE = 48000;

/** The subset of LocalClip the builder needs. */
export interface MixClip {
  segmentId: string;
  startInSegment: number;
  endInSegment: number;
  positionInTimeline: number;
  volume: number;
  laneIndex: number;
}

export interface MixLaneMeta {
  muted?: boolean;
  solo?: boolean;
  gainDb?: number;
}

export function msToFrames(ms: number, rate: number = CANONICAL_RATE): number {
  return Math.max(0, Math.round((ms / 1000) * rate));
}

/**
 * Deterministic 32 bit FNV1a over a string, rendered as 8 hex chars. Enough for
 * cache file names (collisions would need identical prefixes across sessions).
 */
export function stableHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Identity of a stem's rendered content (paths, frames, gains), gain excluded. */
export function stemContentKey(stem: Pick<StemSource, 'totalFrames' | 'clips'>): string {
  const parts = stem.clips
    .map(
      (c) =>
        `${c.path}|${c.startFrame}|${c.frameCount}|${c.positionFrame}|${c.gain.toFixed(4)}`
    )
    .sort();
  return stableHash(`${stem.totalFrames}::${parts.join('::')}`);
}

/** Identity of a whole stem set (order matters: stem index = engine slot). */
export function stemSetKey(stems: StemSource[]): string {
  return stableHash(stems.map((s) => stemContentKey(s)).join('//'));
}

export interface BuildStemSpecsInput {
  clips: MixClip[];
  /** segmentId → playable uri (remote or local). Missing segments are skipped. */
  segmentUris: Record<string, string | undefined>;
  laneMeta: Record<number, MixLaneMeta | undefined>;
  /** Timeline length in ms (getTimelineDuration). */
  totalMs: number;
}

export interface BuiltStems {
  stems: StemSource[];
  /** Lane indices in stem order; the last entry may hold several lanes. */
  stemLanes: number[][];
  /** Segments referenced but without a uri (telemetry). */
  missingSegments: string[];
}

function liveLaneGain(meta: MixLaneMeta | undefined, anySoloed: boolean): number {
  return computeLaneEffectiveVolume({
    clipVolume: 1,
    laneGainDb: meta?.gainDb ?? 0,
    laneMuted: meta?.muted ?? false,
    laneSolo: meta?.solo ?? false,
    anyLaneSoloed: anySoloed,
  });
}

/**
 * Build one stem per lane (up to STEM_COUNT). Lanes are ordered by index so the
 * stem slot is stable while the user edits; lanes past the pool are merged into
 * the last slot with their lane state baked in.
 */
export function buildStemSpecs(input: BuildStemSpecsInput): BuiltStems {
  const totalFrames = Math.max(1, msToFrames(input.totalMs));
  const laneIndices = [...new Set(input.clips.map((c) => c.laneIndex))].sort(
    (a, b) => a - b
  );
  const anySoloed = hasAnySoloedLane(input.laneMeta);
  const missing = new Set<string>();

  const clipSpec = (clip: MixClip, extraGain: number): StemClip | null => {
    const uri = input.segmentUris[clip.segmentId];
    if (!uri) {
      missing.add(clip.segmentId);
      return null;
    }
    const startFrame = msToFrames(clip.startInSegment);
    const endFrame = msToFrames(clip.endInSegment);
    const frameCount = Math.max(0, endFrame - startFrame);
    if (frameCount === 0) return null;
    return {
      path: uri,
      startFrame,
      frameCount,
      positionFrame: msToFrames(clip.positionInTimeline),
      gain: Math.max(0, clip.volume) * extraGain,
    };
  };

  const stems: StemSource[] = [];
  const stemLanes: number[][] = [];
  const liveSlots = Math.min(laneIndices.length, STEM_COUNT);
  const overflow = laneIndices.length > STEM_COUNT;
  const directLanes = overflow
    ? laneIndices.slice(0, STEM_COUNT - 1)
    : laneIndices.slice(0, liveSlots);

  for (const lane of directLanes) {
    const clips = input.clips
      .filter((c) => c.laneIndex === lane)
      .map((c) => clipSpec(c, 1))
      .filter((c): c is StemClip => c !== null);
    stems.push({
      totalFrames,
      clips,
      gain: liveLaneGain(input.laneMeta[lane], anySoloed),
    });
    stemLanes.push([lane]);
  }

  if (overflow) {
    const mergedLanes = laneIndices.slice(STEM_COUNT - 1);
    const clips: StemClip[] = [];
    for (const lane of mergedLanes) {
      const baked = liveLaneGain(input.laneMeta[lane], anySoloed);
      for (const c of input.clips.filter((x) => x.laneIndex === lane)) {
        const spec = clipSpec(c, baked);
        if (spec) clips.push(spec);
      }
    }
    stems.push({ totalFrames, clips, gain: 1 });
    stemLanes.push(mergedLanes);
  }

  return { stems, stemLanes, missingSegments: [...missing] };
}

/**
 * Live gains for an already built stem set after a mixer change, in stem order.
 * Merged overflow stems keep gain 1 (their lane state is baked; a rebuild is
 * needed to apply it, which the caller detects through stemSetKey).
 */
export function liveStemGains(
  stemLanes: number[][],
  laneMeta: Record<number, MixLaneMeta | undefined>
): number[] {
  const anySoloed = hasAnySoloedLane(laneMeta);
  return stemLanes.map((lanes) =>
    lanes.length === 1 ? liveLaneGain(laneMeta[lanes[0]], anySoloed) : 1
  );
}

/**
 * Simple recording playback: the takes play back to back, so the stem is the
 * concatenation of the segments in order. `durationsMs` must be known (the
 * segment model carries durationMs).
 */
export function buildSequentialSpec(
  segments: { uri: string; durationMs: number }[]
): StemSource {
  const clips: StemClip[] = [];
  let cursor = 0;
  for (const seg of segments) {
    const frames = msToFrames(seg.durationMs);
    if (frames === 0) continue;
    clips.push({
      path: seg.uri,
      startFrame: 0,
      frameCount: frames,
      positionFrame: cursor,
      gain: 1,
    });
    cursor += frames;
  }
  return { totalFrames: Math.max(1, cursor), clips, gain: 1 };
}
