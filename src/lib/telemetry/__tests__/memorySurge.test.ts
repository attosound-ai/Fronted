import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MEMORY_SURGE_MB, memorySurgeMB, resetMemorySurge } from '../memorySurge';

test('the first sample never reports a surge', () => {
  resetMemorySurge();
  assert.equal(memorySurgeMB(900), null);
});

test('the client freeze of Sep 20 2026 is flagged on both samples', () => {
  resetMemorySurge();
  assert.equal(memorySurgeMB(267), null);
  assert.equal(memorySurgeMB(613), 346);
  assert.equal(memorySurgeMB(1022), 409);
});

test('normal playback growth stays quiet', () => {
  resetMemorySurge();
  for (const mb of [177, 228, 248, 253, 236]) assert.equal(memorySurgeMB(mb), null);
});

test('the threshold itself counts, one below does not', () => {
  resetMemorySurge();
  memorySurgeMB(100);
  assert.equal(memorySurgeMB(100 + MEMORY_SURGE_MB - 1), null);
  resetMemorySurge();
  memorySurgeMB(100);
  assert.equal(memorySurgeMB(100 + MEMORY_SURGE_MB), MEMORY_SURGE_MB);
});

test('memory going down is never a surge and resets the baseline', () => {
  resetMemorySurge();
  memorySurgeMB(1000);
  assert.equal(memorySurgeMB(200), null);
  assert.equal(memorySurgeMB(360), 160);
});

test('bad samples are ignored and do not move the baseline', () => {
  resetMemorySurge();
  memorySurgeMB(200);
  for (const bad of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(memorySurgeMB(bad as number), null);
  }
  assert.equal(memorySurgeMB(400), 200);
});
