import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatClock } from '../mediaTime';

test('seconds and minutes', () => {
  assert.equal(formatClock(5_000), '0:05');
  assert.equal(formatClock(41_067), '0:41');
  assert.equal(formatClock(62_000), '1:02');
  assert.equal(formatClock(754_000), '12:34');
});

test('past the hour', () => {
  assert.equal(formatClock(3_723_000), '1:02:03');
});

test('rounds to the nearest second, and a clip under half a second still reads as one', () => {
  assert.equal(formatClock(59_600), '1:00');
  assert.equal(formatClock(300), '0:01');
});

test('an unknown length draws nothing', () => {
  for (const v of [null, undefined, 0, -5, NaN, Infinity])
    assert.equal(formatClock(v as number), '');
});
