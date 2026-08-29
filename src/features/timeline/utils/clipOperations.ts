import type { LocalClip, TimeRange, Clipboard, ClipboardFragment } from '../types';

/** Local id for a clip born on the client (split halves, pastes, punch-out survivors). */
export function generateId(): string {
  return 'clip_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}

/**
 * Tolerance (ms) used by `canJoinClips` when checking that two clips
 * are contiguous in the source and touching on the timeline. Positions
 * can be fractional after a drag, so an exact equality would refuse
 * perfectly healable seams.
 */
const JOIN_TOLERANCE_MS = 1;

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
    const collision = neighbors.find((n) => pos < n.end && targetEnd > n.start);
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

  // Spread (not a field list) so everything the clip carries — segment,
  // volume, lane AND the effects model — survives on the second half.
  const clipB: LocalClip = {
    ...clip,
    id: generateId(),
    startInSegment: relativeMs,
    positionInTimeline: clip.positionInTimeline + firstHalfDurationMs,
    order: clip.order + 1,
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

// ── Region editing ──
// Everything below is non-destructive: the source audio is never
// touched, only the (source, in, out, laneStart) tuples change.

/**
 * Remove the window [startMs, endMs) from ONE lane, leaving a gap. A
 * gap renders as silence — nothing on the lane shifts.
 *
 * Per clip on the lane, the four intersection cases:
 *   - fully inside the window   → dropped
 *   - spans the left edge only  → out-point pulled back to `startMs`
 *   - spans the right edge only → in-point advanced, re-anchored at `endMs`
 *   - straddles both edges      → split into two survivors; the right
 *                                 one gets a fresh id
 * Clips that merely touch the window (end === startMs or
 * start === endMs) are untouched. Other lanes are never touched.
 *
 * Pure function. Returns `clips` unchanged for a degenerate window.
 */
export function punchOutRange(
  clips: LocalClip[],
  laneIndex: number,
  startMs: number,
  endMs: number
): LocalClip[] {
  if (endMs <= startMs) return clips;

  const result: LocalClip[] = [];
  for (const clip of clips) {
    if ((clip.laneIndex ?? 0) !== laneIndex) {
      result.push(clip);
      continue;
    }
    const clipStart = clip.positionInTimeline;
    const clipEnd = clipStart + clipDuration(clip);

    // No overlap → untouched.
    if (clipEnd <= startMs || clipStart >= endMs) {
      result.push(clip);
      continue;
    }

    const keepsLeft = clipStart < startMs;
    const keepsRight = clipEnd > endMs;

    // Fully inside → dropped.
    if (!keepsLeft && !keepsRight) continue;

    if (keepsLeft) {
      // Left survivor keeps its id and anchor; only the out-point moves.
      result.push({
        ...clip,
        endInSegment: clip.startInSegment + (startMs - clipStart),
      });
    }
    if (keepsRight) {
      // Right survivor: skip the window's worth of source and re-anchor
      // at the window's end so the audio after the gap stays in time.
      result.push({
        ...clip,
        // Straddle: both halves survive, so the right one needs a new id.
        id: keepsLeft ? generateId() : clip.id,
        startInSegment: clip.startInSegment + (endMs - clipStart),
        positionInTimeline: endMs,
      });
    }
  }
  return normalizeOrders(result);
}

/**
 * Read-only capture of a time window on one lane for the clipboard.
 * Every clip overlapping the window contributes ONE fragment whose
 * in/out points are narrowed to the overlap and whose `offsetMs` is
 * relative to `range.startMs`. Gaps survive implicitly through the
 * offsets, and `durationMs` is the whole window width, so a paste
 * reproduces leading, internal AND trailing silence. Fragments carry
 * NO lane — the paste target decides that.
 *
 * Pure function. Fragments are emitted left → right.
 */
export function sliceRange(clips: LocalClip[], range: TimeRange): Clipboard {
  const { laneIndex, startMs, endMs } = range;
  const durationMs = Math.max(0, endMs - startMs);
  const fragments: ClipboardFragment[] = [];
  if (durationMs === 0) return { fragments, durationMs };

  const laneClips = clips
    .filter((c) => (c.laneIndex ?? 0) === laneIndex)
    .sort((a, b) => a.positionInTimeline - b.positionInTimeline);

  for (const clip of laneClips) {
    const clipStart = clip.positionInTimeline;
    const clipEnd = clipStart + clipDuration(clip);
    const overlapStart = Math.max(clipStart, startMs);
    const overlapEnd = Math.min(clipEnd, endMs);
    if (overlapEnd <= overlapStart) continue;
    fragments.push({
      segmentId: clip.segmentId,
      sourceSegmentId: clip.sourceSegmentId ?? null,
      effects: clip.effects ?? null,
      startInSegment: clip.startInSegment + (overlapStart - clipStart),
      endInSegment: clip.startInSegment + (overlapEnd - clipStart),
      offsetMs: overlapStart - startMs,
      volume: clip.volume,
    });
  }
  return { fragments, durationMs };
}

/**
 * Work out whether `aId` and `bId` can be healed into a single clip
 * and, if so, what the healed clip looks like. Order-insensitive: the
 * clip further left on the timeline is the survivor.
 *
 * Healing is only legal when the seam is invisible — same lane, same
 * source segment, the right clip's in-point continues where the left
 * clip's out-point stops, AND the two touch on the timeline. The last
 * rule keeps the wall invariant: a heal never moves audio and never
 * restores material that was cut. As a final guard the healed clip
 * must not collide with a third clip on the lane (only possible inside
 * the 1 ms tolerance).
 *
 * Returns null when not joinable.
 */
function resolveJoin(
  clips: LocalClip[],
  aId: string,
  bId: string
): { left: LocalClip; right: LocalClip; merged: LocalClip } | null {
  if (aId === bId) return null;
  const a = clips.find((c) => c.id === aId);
  const b = clips.find((c) => c.id === bId);
  if (!a || !b) return null;
  if ((a.laneIndex ?? 0) !== (b.laneIndex ?? 0)) return null;
  if (a.segmentId !== b.segmentId) return null;

  const [left, right] = a.positionInTimeline <= b.positionInTimeline ? [a, b] : [b, a];

  // Source-contiguous: the right clip picks up where the left one stops.
  if (Math.abs(right.startInSegment - left.endInSegment) > JOIN_TOLERANCE_MS) {
    return null;
  }
  // Timeline-adjacent: no gap (and no overlap) between them on the lane.
  const leftEnd = left.positionInTimeline + clipDuration(left);
  if (Math.abs(right.positionInTimeline - leftEnd) > JOIN_TOLERANCE_MS) {
    return null;
  }

  const merged: LocalClip = { ...left, endInSegment: right.endInSegment };
  const mergedEnd = merged.positionInTimeline + clipDuration(merged);
  const collides = clips.some(
    (c) =>
      c.id !== left.id &&
      c.id !== right.id &&
      (c.laneIndex ?? 0) === (left.laneIndex ?? 0) &&
      c.positionInTimeline < mergedEnd &&
      c.positionInTimeline + clipDuration(c) > merged.positionInTimeline
  );
  if (collides) return null;

  return { left, right, merged };
}

/**
 * Whether `joinClips` would heal `aId` and `bId`. For the UI to
 * enable/disable the Join action. See `resolveJoin` for the rules.
 */
export function canJoinClips(clips: LocalClip[], aId: string, bId: string): boolean {
  return resolveJoin(clips, aId, bId) !== null;
}

/**
 * Heal two clips into one — the inverse of a split. The left clip
 * survives with its id and anchor, its out-point extended to the right
 * clip's; the right clip is removed. Returns `clips` unchanged (same
 * reference) when the pair is not joinable (see `canJoinClips`).
 *
 * Pure function.
 */
export function joinClips(clips: LocalClip[], aId: string, bId: string): LocalClip[] {
  const join = resolveJoin(clips, aId, bId);
  if (!join) return clips;
  const result = clips
    .filter((c) => c.id !== join.right.id)
    .map((c) => (c.id === join.left.id ? join.merged : c));
  return normalizeOrders(result);
}

/**
 * Insert `durationMs` of empty time at `atMs`: any clip straddling the
 * insertion point is split there (reusing `splitClipAtPosition`, so the
 * audio is untouched), then every clip starting at or after `atMs`
 * shifts right by `durationMs`. Clips ending exactly at `atMs` stay.
 *
 * Defaults to ALL lanes so a vocal stays aligned to its beat; pass a
 * lane index to open a gap on that lane only.
 *
 * Pure function. Returns `clips` unchanged for a non-positive duration.
 */
export function insertTime(
  clips: LocalClip[],
  atMs: number,
  durationMs: number,
  laneIndex: number | 'all' = 'all'
): LocalClip[] {
  if (durationMs <= 0) return clips;
  const affects = (c: LocalClip) =>
    laneIndex === 'all' || (c.laneIndex ?? 0) === laneIndex;

  // 1. Split straddling clips. Iterate the ORIGINAL list — the split
  //    output contains new ids, and `splitClipAtPosition` looks clips
  //    up by id, so feeding it the running result is safe.
  let result = clips;
  for (const clip of clips) {
    if (!affects(clip)) continue;
    const clipStart = clip.positionInTimeline;
    const clipEnd = clipStart + clipDuration(clip);
    if (atMs > clipStart && atMs < clipEnd) {
      result = splitClipAtPosition(result, clip.id, atMs);
    }
  }

  // 2. Shift everything at/after the insertion point. The right halves
  //    of the splits sit exactly at `atMs`, so they move too.
  const shifted = result.map((c) =>
    affects(c) && c.positionInTimeline >= atMs
      ? { ...c, positionInTimeline: c.positionInTimeline + durationMs }
      : c
  );
  return normalizeOrders(shifted);
}
