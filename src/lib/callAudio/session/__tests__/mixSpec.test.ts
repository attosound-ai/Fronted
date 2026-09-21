/**
 * Pure logic tests for the call playback stem spec builders. Runs under
 * `node --test` through scripts/test-timeline.sh (no jest in this project).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSequentialSpec,
  buildStemSpecs,
  liveStemGains,
  msToFrames,
  stableHash,
  stemContentKey,
  stemSetKey,
  type MixClip,
} from '../mixSpec';
import { STEM_COUNT } from '../types';

const clip = (
  over: Partial<MixClip> & { laneIndex: number; segmentId: string }
): MixClip => ({
  startInSegment: 0,
  endInSegment: 1000,
  positionInTimeline: 0,
  volume: 1,
  ...over,
});

describe('msToFrames', () => {
  it('rounds to the canonical 48 kHz grid and never goes negative', () => {
    assert.equal(msToFrames(1000), 48000);
    assert.equal(msToFrames(0.5), 24);
    assert.equal(msToFrames(-5), 0);
  });
});

describe('stableHash', () => {
  it('is deterministic and 8 hex chars', () => {
    assert.equal(stableHash('abc'), stableHash('abc'));
    assert.match(stableHash('anything'), /^[0-9a-f]{8}$/);
    assert.notEqual(stableHash('a'), stableHash('b'));
  });
});

describe('buildStemSpecs', () => {
  it('bakes clip volume, trims and position; lane state stays live', () => {
    const built = buildStemSpecs({
      clips: [
        clip({
          segmentId: 's1',
          laneIndex: 0,
          startInSegment: 250,
          endInSegment: 1250,
          positionInTimeline: 500,
          volume: 0.5,
        }),
        clip({ segmentId: 's2', laneIndex: 1 }),
      ],
      segmentUris: { s1: 'https://cdn/s1.m4a', s2: 'file:///tmp/s2.wav' },
      laneMeta: { 0: { gainDb: -6 }, 1: { muted: true } },
      totalMs: 2000,
    });
    assert.equal(built.stems.length, 2);
    assert.deepEqual(built.stemLanes, [[0], [1]]);
    const c = built.stems[0].clips[0];
    assert.equal(c.path, 'https://cdn/s1.m4a');
    assert.equal(c.startFrame, 12000);
    assert.equal(c.frameCount, 48000);
    assert.equal(c.positionFrame, 24000);
    assert.equal(c.gain, 0.5);
    assert.equal(built.stems[0].totalFrames, 96000);
    // Lane gain is NOT baked into the clip; it is the stem's live gain.
    assert.ok(Math.abs(built.stems[0].gain - 0.5012) < 0.001);
    assert.equal(built.stems[1].gain, 0);
    assert.deepEqual(built.missingSegments, []);
  });

  it('reports missing segments and skips their clips', () => {
    const built = buildStemSpecs({
      clips: [clip({ segmentId: 'gone', laneIndex: 0 })],
      segmentUris: {},
      laneMeta: {},
      totalMs: 1000,
    });
    assert.deepEqual(built.missingSegments, ['gone']);
    assert.equal(built.stems[0].clips.length, 0);
  });

  it('merges overflow lanes into the last stem with their lane state baked', () => {
    const clips: MixClip[] = [];
    for (let lane = 0; lane < STEM_COUNT + 2; lane++) {
      clips.push(clip({ segmentId: `s${lane}`, laneIndex: lane }));
    }
    const uris: Record<string, string> = {};
    for (let lane = 0; lane < STEM_COUNT + 2; lane++) uris[`s${lane}`] = `u${lane}`;
    const built = buildStemSpecs({
      clips,
      segmentUris: uris,
      laneMeta: { [STEM_COUNT + 1]: { muted: true } },
      totalMs: 1000,
    });
    assert.equal(built.stems.length, STEM_COUNT);
    assert.deepEqual(built.stemLanes[STEM_COUNT - 1], [
      STEM_COUNT - 1,
      STEM_COUNT,
      STEM_COUNT + 1,
    ]);
    const merged = built.stems[STEM_COUNT - 1];
    assert.equal(merged.gain, 1);
    // The muted overflow lane's clip is baked at gain 0.
    const mutedClip = merged.clips.find((c) => c.path === `u${STEM_COUNT + 1}`);
    assert.equal(mutedClip?.gain, 0);
    const liveClip = merged.clips.find((c) => c.path === `u${STEM_COUNT}`);
    assert.equal(liveClip?.gain, 1);
  });

  it('solo silences every non soloed lane through live gains', () => {
    const built = buildStemSpecs({
      clips: [
        clip({ segmentId: 'a', laneIndex: 0 }),
        clip({ segmentId: 'b', laneIndex: 1 }),
      ],
      segmentUris: { a: 'a', b: 'b' },
      laneMeta: { 1: { solo: true } },
      totalMs: 1000,
    });
    assert.deepEqual(liveStemGains(built.stemLanes, { 1: { solo: true } }), [0, 1]);
    assert.deepEqual(liveStemGains(built.stemLanes, {}), [1, 1]);
  });
});

describe('stem keys', () => {
  it('ignores live gain but tracks content', () => {
    const base = buildStemSpecs({
      clips: [clip({ segmentId: 'a', laneIndex: 0 })],
      segmentUris: { a: 'a' },
      laneMeta: {},
      totalMs: 1000,
    });
    const quieter = buildStemSpecs({
      clips: [clip({ segmentId: 'a', laneIndex: 0 })],
      segmentUris: { a: 'a' },
      laneMeta: { 0: { gainDb: -12 } },
      totalMs: 1000,
    });
    const moved = buildStemSpecs({
      clips: [clip({ segmentId: 'a', laneIndex: 0, positionInTimeline: 10 })],
      segmentUris: { a: 'a' },
      laneMeta: {},
      totalMs: 1000,
    });
    assert.equal(stemSetKey(base.stems), stemSetKey(quieter.stems));
    assert.notEqual(stemSetKey(base.stems), stemSetKey(moved.stems));
    assert.equal(stemContentKey(base.stems[0]), stemContentKey(quieter.stems[0]));
  });
});

describe('buildSequentialSpec', () => {
  it('lays segments back to back and skips empty ones', () => {
    const spec = buildSequentialSpec([
      { uri: 'a', durationMs: 1000 },
      { uri: 'b', durationMs: 0 },
      { uri: 'c', durationMs: 500 },
    ]);
    assert.equal(spec.totalFrames, 72000);
    assert.equal(spec.clips.length, 2);
    assert.equal(spec.clips[1].path, 'c');
    assert.equal(spec.clips[1].positionFrame, 48000);
    assert.equal(spec.clips[1].frameCount, 24000);
  });
});
