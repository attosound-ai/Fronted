/**
 * What closing the editor should do, as one pure decision.
 *
 * "Discard" puts the project back the way it was when the editor opened.
 * On Sep 30 2026 the client recorded a take during a call, published it,
 * closed the editor and tapped Discard: the project had been created empty
 * in that same call, so "the way it was" was nothing, and the take he had
 * just published vanished from the project without a word.
 *
 * The rules now:
 *  - nothing changed since the opening state: close, ask nothing, write nothing;
 *  - something changed: ask, and when discarding would throw away audio that
 *    did not exist when the editor opened (a take, an import), say exactly
 *    how many and how long, and make the person confirm that on its own;
 *  - publishing is a checkpoint: what was published can no longer be
 *    discarded (the editor moves the opening state forward).
 */

export interface PlanClip {
  segmentId: string;
  sourceSegmentId?: string | null;
  startInSegment: number;
  endInSegment: number;
  positionInTimeline: number;
  laneIndex: number;
  volume: number;
}

export type ClosePlan =
  | { kind: 'close' }
  | {
      kind: 'ask';
      /** Clips whose audio did not exist when the editor opened. */
      newAudioClips: number;
      /** Their total length on the timeline, in ms. */
      newAudioMs: number;
    };

const audioOf = (c: PlanClip) => c.sourceSegmentId ?? c.segmentId;

function fingerprint(clips: PlanClip[]): string {
  return clips
    .map((c) =>
      [
        c.segmentId,
        c.startInSegment,
        c.endInSegment,
        c.positionInTimeline,
        c.laneIndex,
        Math.round(c.volume * 1000),
      ].join(':')
    )
    .sort()
    .join('|');
}

export function planClose(
  opening: PlanClip[],
  current: PlanClip[],
  otherChanges = false
): ClosePlan {
  if (!otherChanges && fingerprint(opening) === fingerprint(current)) {
    return { kind: 'close' };
  }
  const known = new Set(opening.map(audioOf));
  const fresh = current.filter((c) => !known.has(audioOf(c)));
  return {
    kind: 'ask',
    newAudioClips: fresh.length,
    newAudioMs: fresh.reduce(
      (sum, c) => sum + Math.max(0, c.endInSegment - c.startInSegment),
      0
    ),
  };
}
