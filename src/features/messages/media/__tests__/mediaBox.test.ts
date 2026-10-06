import assert from 'node:assert/strict';
import { test } from 'node:test';

import { aspectOf, mediaBox } from '../mediaBox';

const W = 255; // 65 % of a 393 pt screen
const H = 360;

test('a vertical 9:16 video is a tall bubble, narrowed to fit the height limit', () => {
  const box = mediaBox(aspectOf(1080, 1920), W, H);
  assert.deepEqual(box, { width: 203, height: 360 });
  assert.ok(Math.abs(box.width / box.height - 9 / 16) < 0.01);
});

test('a horizontal 16:9 video keeps the full width', () => {
  assert.deepEqual(mediaBox(aspectOf(1920, 1080), W, H), { width: 255, height: 143 });
});

test('a square video is square', () => {
  assert.deepEqual(mediaBox(aspectOf(1080, 1080), W, H), { width: 255, height: 255 });
});

test('a 4:5 portrait fits without being narrowed', () => {
  assert.deepEqual(mediaBox(aspectOf(1080, 1350), W, H), { width: 255, height: 319 });
});

test('a 3:4 portrait fits exactly under the height limit', () => {
  assert.deepEqual(mediaBox(aspectOf(1080, 1440), W, H), { width: 255, height: 340 });
});

test('extreme shapes are held back', () => {
  // A panorama is shown as 2:1, a very long screenshot as 1:2.
  assert.deepEqual(mediaBox(aspectOf(4000, 500), W, H), { width: 255, height: 128 });
  assert.deepEqual(mediaBox(aspectOf(500, 4000), W, H), { width: 180, height: 360 });
});

test('unknown size keeps the old 16:9 look', () => {
  assert.deepEqual(mediaBox(null, W, H), { width: 255, height: 143 });
});

test('bad metadata is treated as unknown', () => {
  const bad: Array<[number | null | undefined, number | null | undefined]> = [
    [0, 100],
    [100, 0],
    [-5, 100],
    [NaN, 100],
    [Infinity, 100],
    [null, 100],
    [undefined, undefined],
  ];
  for (const [w, h] of bad) assert.equal(aspectOf(w, h), null);
});

test('the box never exceeds the limits, whatever the shape', () => {
  for (const a of [0.1, 0.5, 0.5625, 0.75, 1, 1.33, 1.78, 2, 5]) {
    const box = mediaBox(a, W, H);
    assert.ok(box.width <= W && box.height <= H, String(a));
    assert.ok(box.width > 0 && box.height > 0, String(a));
  }
});
