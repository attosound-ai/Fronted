import type { LocalClip } from '../types';

function generateId(): string {
  return 'clip_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}

/**
 * Recalculate positionInTimeline sequentially based on order,
 * grouped by laneIndex so each lane's clips are independent.
 */
export function recalculatePositions(clips: LocalClip[]): LocalClip[] {
  // Group clips by lane
  const byLane = new Map<number, LocalClip[]>();
  for (const clip of clips) {
    const lane = clip.laneIndex ?? 0;
    if (!byLane.has(lane)) byLane.set(lane, []);
    byLane.get(lane)!.push(clip);
  }

  const result: LocalClip[] = [];

  for (const [, laneClips] of byLane) {
    const sorted = [...laneClips].sort((a, b) => a.order - b.order);
    let currentPosition = 0;

    for (let i = 0; i < sorted.length; i++) {
      const clip = sorted[i];
      const duration = clip.endInSegment - clip.startInSegment;
      result.push({
        ...clip,
        positionInTimeline: currentPosition,
        order: i,
      });
      currentPosition += duration;
    }
  }

  return result;
}

/**
 * Split a clip at a given absolute timeline position into two clips.
 * Preserves laneIndex on both halves.
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

  const clipA: LocalClip = {
    ...clip,
    endInSegment: relativeMs,
  };

  const clipB: LocalClip = {
    id: generateId(),
    segmentId: clip.segmentId,
    startInSegment: relativeMs,
    endInSegment: clip.endInSegment,
    positionInTimeline: 0, // Will be recalculated
    order: clip.order + 0.5, // Temporary fractional order
    volume: clip.volume,
    laneIndex: clip.laneIndex,
  };

  const result = clips.map((c) => (c.id === clipId ? clipA : c));
  result.push(clipB);
  return recalculatePositions(result);
}

/**
 * Delete a clip and recalculate positions.
 */
export function deleteClip(clips: LocalClip[], clipId: string): LocalClip[] {
  const filtered = clips.filter((c) => c.id !== clipId);
  return recalculatePositions(filtered);
}

/**
 * Get total timeline duration — max across all lanes.
 */
export function getTimelineDuration(clips: LocalClip[]): number {
  if (clips.length === 0) return 0;

  const byLane = new Map<number, LocalClip[]>();
  for (const clip of clips) {
    const lane = clip.laneIndex ?? 0;
    if (!byLane.has(lane)) byLane.set(lane, []);
    byLane.get(lane)!.push(clip);
  }

  let maxDuration = 0;
  for (const [, laneClips] of byLane) {
    const sorted = [...laneClips].sort((a, b) => a.order - b.order);
    const last = sorted[sorted.length - 1];
    const laneDuration =
      last.positionInTimeline + (last.endInSegment - last.startInSegment);
    if (laneDuration > maxDuration) maxDuration = laneDuration;
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
      const duration = clip.endInSegment - clip.startInSegment;
      return (
        positionMs >= clip.positionInTimeline &&
        positionMs < clip.positionInTimeline + duration
      );
    }) ?? null
  );
}

/**
 * Find clips at a given timeline position on a specific lane.
 */
export function findClipAtPositionOnLane(
  clips: LocalClip[],
  positionMs: number,
  laneIndex: number
): LocalClip | null {
  return (
    clips.find((clip) => {
      if (clip.laneIndex !== laneIndex) return false;
      const duration = clip.endInSegment - clip.startInSegment;
      return (
        positionMs >= clip.positionInTimeline &&
        positionMs < clip.positionInTimeline + duration
      );
    }) ?? null
  );
}
