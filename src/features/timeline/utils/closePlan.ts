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

export interface PlanLane {
  name?: string | null;
  color?: string | null;
  muted?: boolean;
  solo?: boolean;
  gainDb?: number;
  pan?: number;
}

/**
 * The lane mix as the person set it, ignoring defaults. The editor fills
 * every lane with an empty name and colour on open, so a raw comparison
 * always saw "a change" and asked Save or Discard on a project nobody had
 * touched.
 */
export function laneMixFingerprint(
  lanes: Record<string | number, PlanLane | undefined> | null | undefined
): string {
  const out: string[] = [];
  for (const key of Object.keys(lanes ?? {}).sort()) {
    const lane = (lanes as Record<string, PlanLane | undefined>)[key];
    if (!lane) continue;
    const parts: string[] = [];
    if (lane.name) parts.push(`n=${lane.name}`);
    if (lane.color) parts.push(`c=${lane.color}`);
    if (lane.muted) parts.push('m');
    if (lane.solo) parts.push('s');
    if (lane.gainDb) parts.push(`g=${Math.round(lane.gainDb * 10)}`);
    if (lane.pan) parts.push(`p=${Math.round(lane.pan * 100)}`);
    if (parts.length > 0) out.push(`${key}:${parts.join(',')}`);
  }
  return out.join('|');
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
