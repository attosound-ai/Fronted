/**
 * Pure-logic tests for the non-destructive region editing model:
 * `punchOutRange`, `sliceRange`, `joinClips` / `canJoinClips`,
 * `insertTime`, and the copy → paste round trip through the reducer.
 *
 * The project has no test runner configured, so this uses Node's
 * built-in `node:test` + `node:assert`. To run, from `front/`:
 *
 *   OUT=$(mktemp -d)
 *   cat > "$OUT/tsconfig.json" <<EOF
 *   {
 *     "extends": "$PWD/tsconfig.json",
 *     "compilerOptions": {
 *       "noEmit": false, "outDir": "$OUT/out", "rootDir": "$PWD",
 *       "typeRoots": ["$PWD/node_modules/@types"],
 *       "module": "nodenext", "moduleResolution": "nodenext"
 *     },
 *     "include": [],
 *     "files": ["$PWD/src/features/timeline/utils/__tests__/regionOps.test.ts"]
 *   }
 *   EOF
 *   npx tsc -p "$OUT/tsconfig.json" &&
 *     NODE_PATH="$PWD/node_modules" node --test \
 *       "$OUT/out/src/features/timeline/utils/__tests__/regionOps.test.js"
 *
 * (`typeRoots` because the config lives outside the repo; `rootDir` is the
 * repo root because `src/types/project.ts` imports from `modules/`.)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { TimelineClip } from '@/types/project';
import type {
  ClipboardFragment,
  EffectChain,
  LocalClip,
  TimelineState,
} from '../../types';
import { clipToInput, serverClipToLocal } from '../../types';
import {
  canJoinClips,
  insertTime,
  joinClips,
  punchOutRange,
  sliceRange,
  splitClipAtPosition,
} from '../clipOperations';
import { initialTimelineState, timelineReducer } from '../../hooks/useTimeline';

// ── Fixtures ──

function makeClip(
  id: string,
  laneIndex: number,
  positionInTimeline: number,
  startInSegment: number,
  endInSegment: number,
  segmentId = 'seg'
): LocalClip {
  return {
    id,
    segmentId,
    startInSegment,
    endInSegment,
    positionInTimeline,
    order: 0,
    volume: 1,
    laneIndex,
  };
}

/** A dry (no effects) clipboard fragment. */
function frag(
  segmentId: string,
  startInSegment: number,
  endInSegment: number,
  offsetMs: number,
  volume = 1
): ClipboardFragment {
  return {
    segmentId,
    sourceSegmentId: null,
    effects: null,
    startInSegment,
    endInSegment,
    offsetMs,
    volume,
  };
}

function duration(c: LocalClip): number {
  return c.endInSegment - c.startInSegment;
}

function byId(clips: LocalClip[], id: string): LocalClip | undefined {
  return clips.find((c) => c.id === id);
}

/** Clips on a lane, left → right. */
function laneClips(clips: LocalClip[], lane: number): LocalClip[] {
  return clips
    .filter((c) => c.laneIndex === lane)
    .sort((a, b) => a.positionInTimeline - b.positionInTimeline);
}

/** Everything that matters for a clip's identity + geometry, minus `order`. */
function tuple(c: LocalClip) {
  return {
    id: c.id,
    segmentId: c.segmentId,
    lane: c.laneIndex,
    pos: c.positionInTimeline,
    in: c.startInSegment,
    out: c.endInSegment,
    volume: c.volume,
  };
}

/** Geometry only (for clips whose ids are freshly generated). */
function geometry(c: LocalClip) {
  return [c.segmentId, c.positionInTimeline, c.startInSegment, c.endInSegment];
}

function assertNoOverlaps(clips: LocalClip[], lane: number) {
  const sorted = laneClips(clips, lane);
  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = sorted[i - 1].positionInTimeline + duration(sorted[i - 1]);
    assert.ok(
      sorted[i].positionInTimeline >= prevEnd,
      `overlap on lane ${lane}: ${sorted[i - 1].id} ends ${prevEnd}, ${sorted[i].id} starts ${sorted[i].positionInTimeline}`
    );
  }
}

/** `order` must be 0..n-1 per lane, following timeline position. */
function assertOrdersNormalized(clips: LocalClip[]) {
  const lanes = new Set(clips.map((c) => c.laneIndex));
  for (const lane of lanes) {
    assert.deepEqual(
      laneClips(clips, lane).map((c) => c.order),
      laneClips(clips, lane).map((_, i) => i),
      `orders not normalized on lane ${lane}`
    );
  }
}

function stateWith(
  clips: LocalClip[],
  extra: Partial<TimelineState> = {}
): TimelineState {
  return { ...initialTimelineState, clips, laneCount: 3, ...extra };
}

// ── punchOutRange ──

describe('punchOutRange', () => {
  const base = [
    makeClip('a', 0, 0, 0, 1000), // [0, 1000)
    makeClip('b', 0, 1500, 0, 2000), // [1500, 3500)
    makeClip('c', 0, 4000, 500, 1500), // [4000, 5000)
    makeClip('x', 1, 0, 0, 5000), // lane 1: [0, 5000)
  ];

  it('drops a clip fully inside the window', () => {
    const out = punchOutRange(base, 0, 1400, 3600);
    assert.equal(byId(out, 'b'), undefined);
    assert.deepEqual(
      laneClips(out, 0).map((c) => c.id),
      ['a', 'c']
    );
    assertOrdersNormalized(out);
  });

  it('spans-left: pulls back the out-point of a clip that starts before the window', () => {
    // Window [500, 1200) takes the tail of `a` [0, 1000).
    const out = punchOutRange(base, 0, 500, 1200);
    const a = byId(out, 'a');
    assert.ok(a);
    assert.equal(a.positionInTimeline, 0);
    assert.equal(a.startInSegment, 0);
    assert.equal(a.endInSegment, 500);
  });

  it('spans-right: advances the in-point and re-anchors a clip that ends after the window', () => {
    // Window [1200, 2000) takes the head of `b` [1500, 3500) src[0, 2000).
    const out = punchOutRange(base, 0, 1200, 2000);
    const b = byId(out, 'b');
    assert.ok(b);
    assert.equal(b.positionInTimeline, 2000);
    assert.equal(b.startInSegment, 500);
    assert.equal(b.endInSegment, 2000);
    assert.equal(duration(b), 1500);
  });

  it('straddle: splits into two survivors and the right one gets a new id', () => {
    // Window [2000, 2500) sits inside `b` [1500, 3500) src[0, 2000).
    const out = punchOutRange(base, 0, 2000, 2500);
    const lane0 = laneClips(out, 0);
    assert.equal(lane0.length, 4);

    const left = byId(out, 'b');
    assert.ok(left);
    assert.equal(left.positionInTimeline, 1500);
    assert.deepEqual([left.startInSegment, left.endInSegment], [0, 500]);

    const right = lane0.find((c) => c.positionInTimeline === 2500);
    assert.ok(right);
    assert.notEqual(right.id, 'b');
    assert.equal(right.segmentId, 'seg');
    assert.deepEqual([right.startInSegment, right.endInSegment], [1000, 2000]);
    assert.equal(right.volume, left.volume);
    assert.equal(right.laneIndex, 0);

    // Source audio dropped from the middle is exactly the window width.
    assert.equal(right.startInSegment - left.endInSegment, 500);
    assertNoOverlaps(out, 0);
    assertOrdersNormalized(out);
  });

  it('leaves non-overlapping clips untouched, including edge-touching ones', () => {
    // Window exactly fills the gap: `a` ends at 1000, `b` starts at 1500.
    const out = punchOutRange(base, 0, 1000, 1500);
    assert.deepEqual(laneClips(out, 0).map(tuple), laneClips(base, 0).map(tuple));
  });

  it('never touches other lanes', () => {
    const out = punchOutRange(base, 0, 0, 5000);
    assert.equal(laneClips(out, 0).length, 0);
    const x = byId(out, 'x');
    assert.ok(x);
    assert.deepEqual(tuple(x), tuple(base[3]));
  });

  it('is a no-op (same reference) for a degenerate window', () => {
    assert.equal(punchOutRange(base, 0, 1000, 1000), base);
    assert.equal(punchOutRange(base, 0, 1000, 900), base);
  });
});

// ── sliceRange ──

describe('sliceRange', () => {
  const clips = [
    makeClip('a', 0, 0, 0, 1000, 'segA'), // [0, 1000)
    makeClip('b', 0, 1500, 500, 2000, 'segB'), // [1500, 3000)
    makeClip('x', 1, 0, 0, 5000, 'segX'), // other lane
  ];

  it('narrows overlapping clips to the window and keeps the gap via offsets', () => {
    const cb = sliceRange(clips, { laneIndex: 0, startMs: 500, endMs: 2500 });
    assert.equal(cb.durationMs, 2000);
    assert.deepEqual(cb.fragments, [
      frag('segA', 500, 1000, 0),
      frag('segB', 500, 1500, 1000),
    ]);
    // Fragments carry no lane — the paste target decides.
    for (const f of cb.fragments) assert.equal('laneIndex' in f, false);
  });

  it('narrows both ends of a clip that fully contains the window', () => {
    const cb = sliceRange(clips, { laneIndex: 0, startMs: 200, endMs: 800 });
    assert.deepEqual(cb, {
      durationMs: 600,
      fragments: [frag('segA', 200, 800, 0)],
    });
  });

  it('keeps trailing silence in durationMs and yields no fragments for an empty window', () => {
    const cb = sliceRange(clips, { laneIndex: 0, startMs: 1000, endMs: 1500 });
    assert.deepEqual(cb, { fragments: [], durationMs: 500 });
  });

  it('is read-only', () => {
    const before = clips.map(tuple);
    const order = clips.map((c) => c.id);
    sliceRange(clips, { laneIndex: 0, startMs: 0, endMs: 5000 });
    assert.deepEqual(clips.map(tuple), before);
    assert.deepEqual(
      clips.map((c) => c.id),
      order
    );
  });
});

// ── joinClips / canJoinClips ──

describe('joinClips / canJoinClips', () => {
  it('heals the two halves of a split back into the original (either argument order)', () => {
    const original = makeClip('orig', 0, 100, 0, 2000);
    const split = splitClipAtPosition([original], 'orig', 900);
    assert.equal(split.length, 2);
    const right = split.find((c) => c.id !== 'orig');
    assert.ok(right);

    assert.equal(canJoinClips(split, 'orig', right.id), true);
    assert.equal(canJoinClips(split, right.id, 'orig'), true);

    const healed = joinClips(split, right.id, 'orig');
    assert.equal(healed.length, 1);
    assert.deepEqual(tuple(healed[0]), tuple(original));
    assert.equal(healed[0].order, 0);
  });

  it('refuses a different source segment', () => {
    const clips = [
      makeClip('l', 0, 0, 0, 1000, 'segA'),
      makeClip('r', 0, 1000, 1000, 2000, 'segB'),
    ];
    assert.equal(canJoinClips(clips, 'l', 'r'), false);
    assert.equal(joinClips(clips, 'l', 'r'), clips);
  });

  it('refuses a non-contiguous source (material was cut between them), with or without ripple', () => {
    // Punch [400, 600) out of [0, 1000): survivors have a 200 ms source hole.
    const gap = punchOutRange([makeClip('l', 0, 0, 0, 1000)], 0, 400, 600);
    const r = gap.find((c) => c.id !== 'l');
    assert.ok(r);
    assert.equal(canJoinClips(gap, 'l', r.id), false);

    // Same survivors pulled together (ripple): touching on the timeline
    // but the source hole is still there.
    const rippled = gap.map((c) =>
      c.id === r.id ? { ...c, positionInTimeline: 400 } : c
    );
    assert.equal(canJoinClips(rippled, 'l', r.id), false);
    assert.equal(joinClips(rippled, 'l', r.id), rippled);
  });

  it('refuses different lanes', () => {
    const clips = [makeClip('l', 0, 0, 0, 1000), makeClip('r', 1, 1000, 1000, 2000)];
    assert.equal(canJoinClips(clips, 'l', 'r'), false);
  });

  it('refuses source-contiguous clips that no longer touch on the timeline', () => {
    // Split, then drag the right half away: healing would move audio.
    const clips = [makeClip('l', 0, 0, 0, 1000), makeClip('r', 0, 3000, 1000, 2000)];
    assert.equal(canJoinClips(clips, 'l', 'r'), false);
    assert.equal(joinClips(clips, 'l', 'r'), clips);
  });

  it('tolerates a 1 ms seam but refuses when the healed clip would collide with a third clip', () => {
    // 1 ms source gap, touching on the timeline: healable.
    const seam = [makeClip('l', 0, 0, 0, 1000), makeClip('r', 0, 1000, 1001, 2000)];
    assert.equal(canJoinClips(seam, 'l', 'r'), true);
    const healed = joinClips(seam, 'l', 'r');
    assert.equal(healed.length, 1);
    assert.deepEqual([healed[0].startInSegment, healed[0].endInSegment], [0, 2000]);

    // Healed clip would end at 2000, 1 ms past `r`'s old end (1999):
    // a third clip starting at 1999 makes the heal illegal.
    const crowded = [...seam, makeClip('t', 0, 1999, 0, 500)];
    assert.equal(canJoinClips(crowded, 'l', 'r'), false);
    assert.equal(joinClips(crowded, 'l', 'r'), crowded);
  });

  it('refuses unknown ids and a clip joined with itself', () => {
    const clips = [makeClip('l', 0, 0, 0, 1000)];
    assert.equal(canJoinClips(clips, 'l', 'nope'), false);
    assert.equal(canJoinClips(clips, 'l', 'l'), false);
    assert.equal(joinClips(clips, 'l', 'l'), clips);
  });
});

// ── insertTime ──

describe('insertTime', () => {
  const clips = [
    makeClip('a', 0, 0, 0, 2000), // lane 0: [0, 2000) straddles 1000
    makeClip('b', 0, 2500, 0, 500), // lane 0: [2500, 3000) after
    makeClip('c', 1, 500, 0, 1000), // lane 1: [500, 1500) straddles 1000
    makeClip('f', 2, 700, 0, 300), // lane 2: [700, 1000) ends exactly at 1000
    makeClip('e', 2, 1000, 0, 300), // lane 2: [1000, 1300) starts exactly at 1000
  ];

  it('splits straddling clips on every lane and shifts everything at/after the point', () => {
    const out = insertTime(clips, 1000, 500);

    // Lane 0: `a` → [0, 1000) src[0, 1000) keeps its id; new half at 1500.
    const a1 = byId(out, 'a');
    assert.ok(a1);
    assert.deepEqual(geometry(a1), ['seg', 0, 0, 1000]);
    const a2 = laneClips(out, 0).find((c) => c.positionInTimeline === 1500);
    assert.ok(a2);
    assert.notEqual(a2.id, 'a');
    assert.deepEqual(geometry(a2), ['seg', 1500, 1000, 2000]);
    assert.equal(byId(out, 'b')?.positionInTimeline, 3000);

    // Lane 1: `c` → [500, 1000) src[0, 500); new half at 1500 src[500, 1000).
    const c1 = byId(out, 'c');
    assert.ok(c1);
    assert.deepEqual(geometry(c1), ['seg', 500, 0, 500]);
    const c2 = laneClips(out, 1).find((c) => c.positionInTimeline === 1500);
    assert.ok(c2);
    assert.deepEqual(geometry(c2), ['seg', 1500, 500, 1000]);

    // Lane 2: `f` ends at the point → stays; `e` starts at it → shifts.
    assert.equal(byId(out, 'f')?.positionInTimeline, 700);
    assert.equal(byId(out, 'e')?.positionInTimeline, 1500);

    assert.equal(out.length, clips.length + 2);
    for (const lane of [0, 1, 2]) assertNoOverlaps(out, lane);
    assertOrdersNormalized(out);
  });

  it('limits the gap to one lane when a lane index is given', () => {
    const out = insertTime(clips, 1000, 500, 0);
    assert.equal(byId(out, 'b')?.positionInTimeline, 3000);
    assert.equal(laneClips(out, 0).length, 3);
    assert.deepEqual(laneClips(out, 1).map(tuple), laneClips(clips, 1).map(tuple));
    assert.deepEqual(laneClips(out, 2).map(tuple), laneClips(clips, 2).map(tuple));
    assert.equal(out.length, clips.length + 1);
  });

  it('is a no-op (same reference) for a non-positive duration', () => {
    assert.equal(insertTime(clips, 1000, 0), clips);
    assert.equal(insertTime(clips, 1000, -5), clips);
  });
});

// ── Reducer: copy → paste (overwrite) round trip ──

describe('reducer: copy → paste overwrite round trip', () => {
  const source = [
    makeClip('a', 0, 0, 0, 1000, 'segA'), // lane 0: [0, 1000)
    makeClip('b', 0, 1500, 0, 1500, 'segB'), // lane 0: [1500, 3000)
    makeClip('d', 1, 4000, 0, 4000, 'segD'), // lane 1: [4000, 8000)
  ];
  const state0 = stateWith(source);

  it('pastes at another position on another lane with no overlaps and preserved durations', () => {
    const selected = timelineReducer(state0, {
      type: 'SET_SELECTION',
      range: { laneIndex: 0, startMs: 500, endMs: 2500 },
    });
    assert.equal(selected.activeLaneIndex, 0);

    const copied = timelineReducer(selected, { type: 'COPY_REGION' });
    assert.equal(copied.clipboard?.durationMs, 2000);
    assert.equal(copied.clipboard?.fragments.length, 2);
    // Copy is read-only: clips untouched, selection kept, not dirty.
    assert.equal(copied.clips, state0.clips);
    assert.deepEqual(copied.selection, selected.selection);
    assert.equal(copied.isDirty, false);

    const pasted = timelineReducer(copied, {
      type: 'PASTE_REGION',
      atMs: 5000,
      laneIndex: 1,
    });
    assert.equal(pasted.isDirty, true);
    assert.equal(pasted.selection, null);
    // The clipboard survives a paste (paste again elsewhere).
    assert.equal(pasted.clipboard, copied.clipboard);

    // Source lane untouched.
    assert.deepEqual(
      laneClips(pasted.clips, 0).map(tuple),
      laneClips(source, 0).map(tuple)
    );

    // Destination lane: D-left | A' | (gap) | B' | D-right.
    const lane1 = laneClips(pasted.clips, 1);
    assert.deepEqual(lane1.map(geometry), [
      ['segD', 4000, 0, 1000],
      ['segA', 5000, 500, 1000],
      ['segB', 6000, 0, 1000],
      ['segD', 7000, 3000, 4000],
    ]);
    assert.deepEqual(lane1.map(duration), [1000, 500, 1000, 1000]);
    assertNoOverlaps(pasted.clips, 1);
    assertOrdersNormalized(pasted.clips);

    // Left survivor of the punch-out keeps its id; everything else is fresh and unique.
    assert.equal(lane1[0].id, 'd');
    const freshIds = lane1.slice(1).map((c) => c.id);
    assert.equal(new Set(freshIds).size, 3);
    assert.ok(freshIds.every((id) => !byId(source, id)));
  });

  it('PASTE_REGION is a no-op (same state) without a clipboard', () => {
    assert.equal(
      timelineReducer(state0, { type: 'PASTE_REGION', atMs: 5000, laneIndex: 1 }),
      state0
    );
  });
});

// ── Reducer: selection / clipboard / undo contract ──

describe('reducer: selection, clipboard and snapshot contract', () => {
  const clips = [
    makeClip('a', 0, 0, 0, 3000), // lane 0: [0, 3000)
    makeClip('b', 0, 3500, 0, 500), // lane 0: [3500, 4000)
    makeClip('x', 1, 0, 0, 4000), // lane 1: [0, 4000)
  ];
  const range = { laneIndex: 0, startMs: 1000, endMs: 2000 };
  const selected = timelineReducer(stateWith(clips), { type: 'SET_SELECTION', range });

  it('SELECT_CLIP (with or without a clip) and SET_SELECTION(null) clear the region', () => {
    assert.equal(
      timelineReducer(selected, { type: 'SELECT_CLIP', clipId: 'a' }).selection,
      null
    );
    assert.equal(
      timelineReducer(selected, { type: 'SELECT_CLIP', clipId: null }).selection,
      null
    );
    assert.equal(
      timelineReducer(selected, { type: 'SET_SELECTION', range: null }).selection,
      null
    );
  });

  it('clip-mutating ops clear the region; mixer ops keep it', () => {
    assert.equal(
      timelineReducer(selected, { type: 'DELETE_CLIP', clipId: 'b' }).selection,
      null
    );
    assert.equal(
      timelineReducer(selected, {
        type: 'TRIM_CLIP',
        clipId: 'b',
        startInSegment: 0,
        endInSegment: 400,
      }).selection,
      null
    );
    assert.equal(
      timelineReducer(selected, { type: 'SET_CLIPS', clips: [] }).selection,
      null
    );
    assert.deepEqual(
      timelineReducer(selected, { type: 'SET_LANE_MUTE', laneIndex: 0, muted: true })
        .selection,
      range
    );
  });

  it('RESTORE_SNAPSHOT leaves selection and clipboard alone', () => {
    const copied = timelineReducer(selected, { type: 'COPY_REGION' });
    const restored = timelineReducer(copied, {
      type: 'RESTORE_SNAPSHOT',
      clips: [],
      laneMeta: {},
    });
    assert.deepEqual(restored.clips, []);
    assert.deepEqual(restored.selection, range);
    assert.equal(restored.clipboard, copied.clipboard);
  });

  it('CUT_REGION leaves a gap by default and ripples the lane only when asked', () => {
    const cut = timelineReducer(selected, { type: 'CUT_REGION' });
    assert.equal(cut.isDirty, true);
    assert.equal(cut.selection, null);
    assert.deepEqual(cut.clipboard, {
      durationMs: 1000,
      fragments: [frag('seg', 1000, 2000, 0)],
    });
    assert.deepEqual(laneClips(cut.clips, 0).map(geometry), [
      ['seg', 0, 0, 1000],
      ['seg', 2000, 2000, 3000],
      ['seg', 3500, 0, 500],
    ]);

    const rippled = timelineReducer(selected, { type: 'CUT_REGION', ripple: true });
    assert.deepEqual(laneClips(rippled.clips, 0).map(geometry), [
      ['seg', 0, 0, 1000],
      ['seg', 1000, 2000, 3000],
      ['seg', 2500, 0, 500],
    ]);
    // Other lanes never move.
    assert.deepEqual(laneClips(rippled.clips, 1).map(tuple), [tuple(clips[2])]);
    assertNoOverlaps(rippled.clips, 0);
    assertOrdersNormalized(rippled.clips);
    // The rippled halves touch but are NOT joinable: the source has a hole.
    const [l, r] = laneClips(rippled.clips, 0);
    assert.equal(canJoinClips(rippled.clips, l.id, r.id), false);
  });

  it('SILENCE_REGION punches out without writing the clipboard', () => {
    const silenced = timelineReducer(selected, { type: 'SILENCE_REGION' });
    assert.equal(silenced.clipboard, null);
    assert.equal(silenced.selection, null);
    assert.equal(silenced.isDirty, true);
    assert.deepEqual(laneClips(silenced.clips, 0).map(geometry), [
      ['seg', 0, 0, 1000],
      ['seg', 2000, 2000, 3000],
      ['seg', 3500, 0, 500],
    ]);
  });

  it('cut / silence drop a dangling clip selection', () => {
    const withB = timelineReducer(selected, {
      type: 'SET_SELECTION',
      range: { laneIndex: 0, startMs: 3400, endMs: 4100 },
    });
    const state = { ...withB, selectedClipId: 'b' };
    assert.equal(timelineReducer(state, { type: 'CUT_REGION' }).selectedClipId, null);
    assert.equal(timelineReducer(state, { type: 'SILENCE_REGION' }).selectedClipId, null);
  });

  it('COPY / CUT / SILENCE are no-ops without a selection', () => {
    const none = stateWith(clips);
    assert.equal(timelineReducer(none, { type: 'COPY_REGION' }), none);
    assert.equal(timelineReducer(none, { type: 'CUT_REGION' }), none);
    assert.equal(timelineReducer(none, { type: 'SILENCE_REGION' }), none);
  });

  it('JOIN_CLIPS heals a split and keeps the healed clip selected; no-op otherwise', () => {
    const split = timelineReducer(
      { ...stateWith(clips), playbackPositionMs: 1200 },
      { type: 'SPLIT_AT_POSITION', positionMs: 1200 }
    );
    const rightId = split.selectedClipId;
    assert.ok(rightId && rightId !== 'a');

    const joined = timelineReducer(split, {
      type: 'JOIN_CLIPS',
      clipIdA: rightId,
      clipIdB: 'a',
    });
    assert.equal(joined.isDirty, true);
    assert.equal(joined.selectedClipId, 'a');
    assert.deepEqual(
      laneClips(joined.clips, 0).map(tuple),
      laneClips(clips, 0).map(tuple)
    );

    // Not joinable (different lanes) → same state reference.
    assert.equal(
      timelineReducer(split, { type: 'JOIN_CLIPS', clipIdA: 'a', clipIdB: 'x' }),
      split
    );
  });

  it('INSERT_TIME defaults to all lanes; allLanes:false uses the given (or active) lane', () => {
    const all = timelineReducer(stateWith(clips), {
      type: 'INSERT_TIME',
      atMs: 500,
      durationMs: 250,
    });
    assert.equal(all.isDirty, true);
    assert.equal(laneClips(all.clips, 0).length, 3);
    assert.equal(laneClips(all.clips, 1).length, 2);
    assert.equal(byId(all.clips, 'b')?.positionInTimeline, 3750);

    const one = timelineReducer(stateWith(clips, { activeLaneIndex: 1 }), {
      type: 'INSERT_TIME',
      atMs: 500,
      durationMs: 250,
      allLanes: false,
    });
    assert.deepEqual(laneClips(one.clips, 0).map(tuple), laneClips(clips, 0).map(tuple));
    assert.equal(laneClips(one.clips, 1).length, 2);

    const explicit = timelineReducer(stateWith(clips, { activeLaneIndex: 1 }), {
      type: 'INSERT_TIME',
      atMs: 500,
      durationMs: 250,
      allLanes: false,
      laneIndex: 0,
    });
    assert.equal(laneClips(explicit.clips, 0).length, 3);
    assert.deepEqual(
      laneClips(explicit.clips, 1).map(tuple),
      laneClips(clips, 1).map(tuple)
    );
  });
});

// ── Effects model: sourceSegmentId / effects travel with every copy ──

describe('effects fields (sourceSegmentId / effects)', () => {
  const chain: EffectChain = { reverb: { preset: 'plate', wetDryMix: 30 } };
  const wet: LocalClip = {
    ...makeClip('w', 0, 1000, 100, 2100, 'render-1'),
    sourceSegmentId: 'dry-1',
    effects: chain,
    volume: 0.8,
  };
  const applyPatch = { segmentId: 'render-2', sourceSegmentId: 'dry-1', effects: chain };

  it('PATCH_CLIP_EFFECTS replaces exactly segmentId / sourceSegmentId / effects, keeps geometry', () => {
    const dry = makeClip('d', 1, 250, 40, 940, 'dry-1');
    const state = timelineReducer(stateWith([dry, wet]), {
      type: 'SET_SELECTION',
      range: { laneIndex: 1, startMs: 0, endMs: 100 },
    });
    const patched = timelineReducer(state, {
      type: 'PATCH_CLIP_EFFECTS',
      clipId: 'd',
      patch: applyPatch,
    });
    const c = byId(patched.clips, 'd');
    assert.ok(c);
    assert.equal(c.segmentId, 'render-2');
    assert.equal(c.sourceSegmentId, 'dry-1');
    assert.deepEqual(c.effects, chain);
    assert.deepEqual(
      [
        c.startInSegment,
        c.endInSegment,
        c.positionInTimeline,
        c.order,
        c.volume,
        c.laneIndex,
      ],
      [40, 940, 250, 0, 1, 1]
    );
    assert.equal(patched.isDirty, true);
    assert.equal(patched.selection, null);
    // The other clip is untouched (same reference).
    assert.equal(byId(patched.clips, 'w'), wet);
    // Unknown id → same state, nothing marked dirty.
    assert.equal(
      timelineReducer(state, {
        type: 'PATCH_CLIP_EFFECTS',
        clipId: 'nope',
        patch: applyPatch,
      }),
      state
    );
  });

  it('undo (restoring the pre-patch snapshot) brings back the dry segment; remove = patch back', () => {
    const dry = makeClip('d', 0, 250, 40, 940, 'dry-1');
    const state = stateWith([dry]);
    // What pushUndo() captures right before the patch.
    const snapshot = state.clips.map((c) => ({ ...c }));
    const patched = timelineReducer(state, {
      type: 'PATCH_CLIP_EFFECTS',
      clipId: 'd',
      patch: applyPatch,
    });
    assert.equal(byId(patched.clips, 'd')?.segmentId, 'render-2');

    const undone = timelineReducer(patched, {
      type: 'RESTORE_SNAPSHOT',
      clips: snapshot,
      laneMeta: {},
    });
    const c = byId(undone.clips, 'd');
    assert.ok(c);
    assert.equal(c.segmentId, 'dry-1');
    assert.equal(c.sourceSegmentId, undefined);
    assert.equal(c.effects, undefined);
    assert.deepEqual(tuple(c), tuple(dry));

    // "Remove effects" is the same patch pointing back at the dry source.
    const removed = timelineReducer(patched, {
      type: 'PATCH_CLIP_EFFECTS',
      clipId: 'd',
      patch: { segmentId: 'dry-1', sourceSegmentId: null, effects: null },
    });
    const r = byId(removed.clips, 'd');
    assert.ok(r);
    assert.deepEqual([r.segmentId, r.sourceSegmentId, r.effects], ['dry-1', null, null]);
    assert.deepEqual(
      tuple({ ...r, sourceSegmentId: undefined, effects: undefined }),
      tuple(dry)
    );
  });

  it('split, punch-out, duplicate, copy and paste all carry the effects fields', () => {
    const halves = splitClipAtPosition([wet], 'w', 1500);
    assert.equal(halves.length, 2);
    for (const h of halves) {
      assert.deepEqual(
        [h.segmentId, h.sourceSegmentId, h.effects, h.volume],
        ['render-1', 'dry-1', chain, 0.8]
      );
    }

    const punched = punchOutRange([wet], 0, 1400, 1600);
    assert.equal(punched.length, 2);
    for (const p of punched) {
      assert.deepEqual([p.sourceSegmentId, p.effects], ['dry-1', chain]);
    }

    const dup = timelineReducer(stateWith([wet]), {
      type: 'DUPLICATE_CLIP',
      clipId: 'w',
    });
    const copy = dup.clips.find((c) => c.id !== 'w');
    assert.ok(copy);
    assert.deepEqual(
      [copy.segmentId, copy.sourceSegmentId, copy.effects, copy.volume],
      ['render-1', 'dry-1', chain, 0.8]
    );

    const cb = sliceRange([wet], { laneIndex: 0, startMs: 1200, endMs: 1800 });
    assert.deepEqual(cb.fragments, [
      { ...frag('render-1', 300, 900, 0, 0.8), sourceSegmentId: 'dry-1', effects: chain },
    ]);
    const pasted = timelineReducer(
      { ...stateWith([wet]), clipboard: cb },
      { type: 'PASTE_REGION', atMs: 0, laneIndex: 2 }
    );
    const [p] = laneClips(pasted.clips, 2);
    assert.ok(p);
    assert.deepEqual(
      [p.segmentId, p.sourceSegmentId, p.effects, p.volume],
      ['render-1', 'dry-1', chain, 0.8]
    );
  });

  it('clipToInput / serverClipToLocal: absent stays omitted, null and values round-trip', () => {
    const dryInput = clipToInput(makeClip('d', 0, 0, 0, 100, 'dry-1'));
    assert.equal('sourceSegmentId' in dryInput, false);
    assert.equal('effects' in dryInput, false);

    const wetInput = clipToInput(wet);
    assert.equal(wetInput.sourceSegmentId, 'dry-1');
    assert.deepEqual(wetInput.effects, chain);

    const cleared = clipToInput({ ...wet, sourceSegmentId: null, effects: null });
    assert.equal(cleared.sourceSegmentId, null);
    assert.equal(cleared.effects, null);

    const server: TimelineClip = {
      id: 's',
      projectId: 'p',
      segmentId: 'render-1',
      startInSegment: 0,
      endInSegment: 100,
      positionInTimeline: 0,
      order: 0,
      volume: 1,
      laneIndex: 0,
      createdAt: '',
      updatedAt: '',
    };
    const localDry = serverClipToLocal(server);
    assert.equal('sourceSegmentId' in localDry, false);
    assert.equal('effects' in localDry, false);

    const localWet = serverClipToLocal({
      ...server,
      sourceSegmentId: 'dry-1',
      effects: chain,
    });
    assert.equal(localWet.sourceSegmentId, 'dry-1');
    assert.deepEqual(localWet.effects, chain);

    const localNull = serverClipToLocal({
      ...server,
      sourceSegmentId: null,
      effects: null,
    });
    assert.equal(localNull.sourceSegmentId, null);
    assert.equal(localNull.effects, null);
  });
});
