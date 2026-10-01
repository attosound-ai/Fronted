import { test } from 'node:test';
import assert from 'node:assert/strict';

import { laneMixFingerprint, planClose, type PlanClip } from '../closePlan';

const clip = (over: Partial<PlanClip> = {}): PlanClip => ({
  segmentId: 'seg-a',
  startInSegment: 0,
  endInSegment: 10_000,
  positionInTimeline: 0,
  laneIndex: 0,
  volume: 1,
  ...over,
});

test('nothing changed: close without asking', () => {
  assert.deepEqual(planClose([clip()], [clip()]), { kind: 'close' });
  assert.deepEqual(planClose([], []), { kind: 'close' });
});

test('the order clips are listed in is not a change', () => {
  const a = clip();
  const b = clip({ segmentId: 'seg-b', positionInTimeline: 20_000 });
  assert.deepEqual(planClose([a, b], [b, a]), { kind: 'close' });
});

// El caso del cliente del 30 de septiembre de 2026: proyecto creado vacío en
// la llamada, una toma de 14.889 s grabada, y Discard la borraba sin avisar.
test('a take recorded in this session is named before it can be discarded', () => {
  const take = clip({ segmentId: 'take-1', endInSegment: 14_889 });
  assert.deepEqual(planClose([], [take]), {
    kind: 'ask',
    newAudioClips: 1,
    newAudioMs: 14_889,
  });
});

test('moving or trimming existing audio asks, but loses no audio', () => {
  assert.deepEqual(planClose([clip()], [clip({ positionInTimeline: 5_000 })]), {
    kind: 'ask',
    newAudioClips: 0,
    newAudioMs: 0,
  });
  assert.deepEqual(planClose([clip()], [clip({ endInSegment: 4_000 })]), {
    kind: 'ask',
    newAudioClips: 0,
    newAudioMs: 0,
  });
});

test('a split of old audio is not new audio', () => {
  const left = clip({ endInSegment: 5_000 });
  const right = clip({ startInSegment: 5_000, positionInTimeline: 5_000 });
  assert.deepEqual(planClose([clip()], [left, right]), {
    kind: 'ask',
    newAudioClips: 0,
    newAudioMs: 0,
  });
});

test('an effect render of old audio is not new audio', () => {
  const rendered = clip({ segmentId: 'render-1', sourceSegmentId: 'seg-a' });
  assert.equal(
    (planClose([clip()], [rendered]) as { newAudioClips: number }).newAudioClips,
    0
  );
});

test('deleting everything asks, and loses nothing new', () => {
  assert.deepEqual(planClose([clip()], []), {
    kind: 'ask',
    newAudioClips: 0,
    newAudioMs: 0,
  });
});

test('a change outside the clips (lane mix, names) still asks', () => {
  assert.equal(planClose([clip()], [clip()], true).kind, 'ask');
});

// Lo que la app rellena sola al abrir no es un cambio de la persona.
test('lane defaults filled on open are not a change', () => {
  assert.equal(
    laneMixFingerprint({}),
    laneMixFingerprint({ 0: { name: '', color: '' } })
  );
  assert.equal(laneMixFingerprint(undefined), '');
  assert.equal(
    laneMixFingerprint({
      0: { name: '', color: '', muted: false, solo: false, gainDb: 0, pan: 0 },
    }),
    ''
  );
});

test('a real lane change is a change', () => {
  const base = laneMixFingerprint({ 0: { name: '', color: '' } });
  assert.notEqual(laneMixFingerprint({ 0: { name: 'Vocals', color: '' } }), base);
  assert.notEqual(laneMixFingerprint({ 0: { name: '', color: '', gainDb: -6 } }), base);
  assert.notEqual(laneMixFingerprint({ 0: { name: '', color: '', muted: true } }), base);
  assert.notEqual(laneMixFingerprint({ 1: { name: '', color: '#FF0000' } }), base);
});
