import assert from 'node:assert/strict';
import { test } from 'node:test';

import { morphStart } from '../editMorph';

const field = { x: 60, y: 600, width: 310, height: 40 };

test('an own bubble on the right edge: the field starts as narrow as the bubble', () => {
  const start = morphStart({ x: 300, y: 596, width: 110, height: 40 }, field);
  assert.equal(start.left, 240);
  assert.equal(start.dy, -4);
});

test('a bubble wider than the field starts with no inset', () => {
  assert.equal(morphStart({ x: 20, y: 600, width: 390, height: 40 }, field).left, 0);
});

test('the field never starts narrower than a button', () => {
  assert.equal(morphStart({ x: 420, y: 600, width: 5, height: 40 }, field).left, 266);
});

test('a bubble a few rows up flies down into the field', () => {
  assert.equal(morphStart({ x: 300, y: 480, width: 110, height: 40 }, field).dy, -120);
});

test('a bubble far from the composer does not fly across the screen', () => {
  assert.equal(morphStart({ x: 300, y: 120, width: 110, height: 40 }, field).dy, 0);
});

test('a tall bubble is matched by its centre', () => {
  assert.equal(morphStart({ x: 100, y: 540, width: 300, height: 100 }, field).dy, -30);
});

test('a measurement that failed leaves the field in place', () => {
  const start = morphStart({ x: NaN, y: NaN, width: NaN, height: NaN }, field);
  assert.deepEqual(start, { left: 0, dy: 0 });
});
