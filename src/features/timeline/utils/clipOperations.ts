import type { LocalClip } from '../types';

function generateId(): string {
  return 'clip_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}

/** Duration of a clip in milliseconds. */
function clipDuration(clip: LocalClip): number {
  return clip.endInSegment - clip.startInSegment;
}

/**
 * Find the rightmost edge (in ms) of all clips on a given lane. Used to
 * decide where a freshly added clip should land — at the end of the
 * existing content on its lane, so it doesn't overlap.
 */
export function endOfLaneMs(clips: LocalClip[], laneIndex: number): number {
  let max = 0;
  for (const clip of clips) {
    if ((clip.laneIndex ?? 0) !== laneIndex) continue;
    const end = clip.positionInTimeline + clipDuration(clip);
    if (end > max) max = end;
  }
  return max;
}

/**
 * Compute the legal position for a clip given the clips on its lane,
 * enforcing the "wall" rule: a clip cannot overlap any of its
 * neighbors. If the requested position would cause an overlap, the
 * clip is snapped to the nearest legal slot — either the right edge
 * of the left neighbor (when the user dragged right into something)
 * or the left edge minus the clip's duration (when the user dragged
 * left into something), whichever is closer to the requested position.
 *
 * Pure function, safe to use both in the reducer (final clamp on drop)
 * and during a live drag (visual feedback).
 *
 * @param clips     All clips in the timeline (any lane).
 * @param clipId    The clip being dragged.
 * @param requestedPositionMs  Where the user wants to drop it.
 * @returns         The nearest legal `positionInTimeline` for the clip.
 *                  Returns the requested position unchanged if no
 *                  collision; clamps to >= 0; returns the requested
 *                  position if `clipId` doesn't exist (defensive).
 */
export function clampClipPosition(
  clips: LocalClip[],
  clipId: string,
  requestedPositionMs: number
): number {
  const target = clips.find((c) => c.id === clipId);
  if (!target) return Math.max(0, requestedPositionMs);

  const duration = clipDuration(target);
  const lane = target.laneIndex ?? 0;

  // Other clips on the same lane, sorted left → right.
  const neighbors = clips
    .filter((c) => c.id !== clipId && (c.laneIndex ?? 0) === lane)
    .map((c) => ({
      start: c.positionInTimeline,
      end: c.positionInTimeline + clipDuration(c),
    }))
    .sort((a, b) => a.start - b.start);

  let pos = Math.max(0, requestedPositionMs);

  // Check overlap iteratively. After each snap we re-check the new
  // position against all neighbors because the snap may push us into
  // a different neighbor's range.
  // Bounded: at most O(neighbors²) but in practice O(neighbors) because
  // each iteration moves to a non-overlapping anchor.
  const maxIterations = neighbors.length + 2;
  for (let iter = 0; iter < maxIterations; iter++) {
    const targetEnd = pos + duration;
    const collision = neighbors.find(
      (n) => pos < n.end && targetEnd > n.start
    );
    if (!collision) break;

    // Snap to either the left side or right side of the collision,
    // whichever is closer to the requested position.
    const snapLeft = Math.max(0, collision.start - duration);
    const snapRight = collision.end;
    const distLeft = Math.abs(snapLeft - requestedPositionMs);
    const distRight = Math.abs(snapRight - requestedPositionMs);
    pos = distLeft <= distRight ? snapLeft : snapRight;
    pos = Math.max(0, pos);
  }

  return pos;
}

/**
 * Find the legal position on `targetLane` for a clip of `durationMs`
 * width that is closest to `preferredPositionMs`. Used when dropping
 * a clip onto a different lane: the clip wants to land at the
 * x-position it had on the source lane, but only if there's a free
 * slot of the right size; otherwise it picks the closest gap that
 * fits, or falls back to `endOfLaneMs(targetLane)` if no internal gap
 * accommodates the clip.
 *
 * Pure function. Treats the area to the right of the rightmost clip
 * on `targetLane` as an infinite gap.
 */
export function findNearestFreeSlot(
  clips: LocalClip[],
  targetLane: number,
  durationMs: number,
  preferredPositionMs: number
): number {
  const laneClips = clips
    .filter((c) => (c.laneIndex ?? 0) === targetLane)
    .map((c) => ({
      start: c.positionInTimeline,
      end: c.positionInTimeline + clipDuration(c),
    }))
    .sort((a, b) => a.start - b.start);

  const wanted = Math.max(0, preferredPositionMs);

  // Build the list of gaps: [0, first.start], [prev.end, next.start],
  // and [last.end, +∞).
  type Gap = { start: number; end: number | null };
  const gaps: Gap[] = [];
  let cursor = 0;
  for (const c of laneClips) {
    if (c.start > cursor) gaps.push({ start: cursor, end: c.start });
    cursor = Math.max(cursor, c.end);
  }
  // Trailing infinite gap.
  gaps.push({ start: cursor, end: null });

  // Find the gap whose available width is >= duration AND that's
  // closest to `wanted`. Inside the chosen gap, return the position
  // that is closest to `wanted`.
  let best: number | null = null;
  let bestDistance = Infinity;
  for (const g of gaps) {
    const gapWidth = g.end === null ? Infinity : g.end - g.start;
    if (gapWidth < durationMs) continue;
    // Clamp `wanted` into the legal range of this gap.
    const minPos = g.start;
    const maxPos = g.end === null ? wanted : g.end - durationMs;
    const candidate = Math.min(Math.max(wanted, minPos), maxPos);
    const dist = Math.abs(candidate - wanted);
    if (dist < bestDistance) {
      best = candidate;
      bestDistance = dist;
    }
  }

  // The trailing infinite gap is always present, so `best` is never
  // null in practice. Defensive fallback to end-of-lane just in case.
  return best ?? endOfLaneMs(clips, targetLane);
}

/**
 * Normalize each lane's clips to have a sane integer `order` field
 * (sorted by their absolute timeline position). The `order` field is
 * legacy from when positions were derived from order — we keep it for
 * backend compatibility, but it's no longer the source of truth for
 * position. `positionInTimeline` is.
 */
export function normalizeOrders(clips: LocalClip[]): LocalClip[] {
  const byLane = new Map<number, LocalClip[]>();
  for (const clip of clips) {
    const lane = clip.laneIndex ?? 0;
    if (!byLane.has(lane)) byLane.set(lane, []);
    byLane.get(lane)!.push(clip);
  }

  const result: LocalClip[] = [];
  for (const [, laneClips] of byLane) {
    const sorted = [...laneClips].sort(
      (a, b) => a.positionInTimeline - b.positionInTimeline
    );
    sorted.forEach((clip, i) => {
      result.push({ ...clip, order: i });
    });
  }
  return result;
}

/**
 * Split a clip at a given absolute timeline position into two clips.
 * Both halves are placed back-to-back at the original clip's position
 * so the visual content doesn't shift. The second half's
 * `positionInTimeline` is the original position plus the first half's
 * new duration.
 */
export function splitClipAtPosition(
  clips: LocalClip[],
  clipId: string,
  positionMs: number
): LocalClip[] {
  const clip = clips.find((c) => c.id === clipId);
  if (!clip) return clips;

  // Convert timeline position to segment-relative position
  const relativeMs = positionMs - clip.positionInTimeline + clip.startInSegment;

  // Validate split point is within clip bounds
  if (relativeMs <= clip.startInSegment || relativeMs >= clip.endInSegment) {
    return clips;
  }

  const firstHalfDurationMs = relativeMs - clip.startInSegment;

  const clipA: LocalClip = {
    ...clip,
    endInSegment: relativeMs,
  };

  const clipB: LocalClip = {
    id: generateId(),
    segmentId: clip.segmentId,
    startInSegment: relativeMs,
    endInSegment: clip.endInSegment,
    positionInTimeline: clip.positionInTimeline + firstHalfDurationMs,
    order: clip.order + 1,
    volume: clip.volume,
    laneIndex: clip.laneIndex,
  };

  const result = clips.map((c) => (c.id === clipId ? clipA : c));
  result.push(clipB);
  return normalizeOrders(result);
}

/**
 * Delete a clip. Other clips keep their absolute positions — no
 * sequential shifting.
 */
export function deleteClip(clips: LocalClip[], clipId: string): LocalClip[] {
  return clips.filter((c) => c.id !== clipId);
}

/**
 * Get total timeline duration — max across all lanes.
 */
export function getTimelineDuration(clips: LocalClip[]): number {
  let maxDuration = 0;
  for (const clip of clips) {
    const end = clip.positionInTimeline + clipDuration(clip);
    if (end > maxDuration) maxDuration = end;
  }
  return maxDuration;
}

/**
 * Find which clip contains a given timeline position.
 */
export function findClipAtPosition(
  clips: LocalClip[],
  positionMs: number
): LocalClip | null {
  return (
    clips.find((clip) => {
      const duration = clipDuration(clip);
      return (
        positionMs >= clip.positionInTimeline &&
        positionMs < clip.positionInTimeline + duration
      );
    }) ?? null
  );
}

/**
 * Find a clip at a given timeline position on a specific lane.
 */
export function findClipAtPositionOnLane(
  clips: LocalClip[],
  positionMs: number,
  laneIndex: number
): LocalClip | null {
  return (
    clips.find((clip) => {
      if (clip.laneIndex !== laneIndex) return false;
      const duration = clipDuration(clip);
      return (
        positionMs >= clip.positionInTimeline &&
        positionMs < clip.positionInTimeline + duration
      );
    }) ?? null
  );
}
