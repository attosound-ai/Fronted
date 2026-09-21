import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DB_MAX,
  DB_MIN,
  GAIN_CENTER_SNAP,
  gainDbToSlider,
  sliderToGainDb,
} from '../dbConversion';

test('unity gain sits exactly in the middle of the slider', () => {
  assert.equal(gainDbToSlider(0), 0.5);
  assert.equal(sliderToGainDb(0.5), 0);
});

test('the ends of the travel are the ends of the range', () => {
  assert.equal(gainDbToSlider(DB_MIN), 0);
  assert.equal(gainDbToSlider(DB_MAX), 1);
  assert.equal(sliderToGainDb(0), DB_MIN);
  assert.equal(sliderToGainDb(1), DB_MAX);
});

test('each half is linear in dB', () => {
  assert.equal(gainDbToSlider(DB_MIN / 2), 0.25);
  assert.equal(gainDbToSlider(DB_MAX / 2), 0.75);
  assert.equal(sliderToGainDb(0.25), DB_MIN / 2);
  assert.equal(sliderToGainDb(0.75), DB_MAX / 2);
});

test('the middle snaps to 0 dB so unity is easy to find', () => {
  assert.equal(sliderToGainDb(0.5 + GAIN_CENTER_SNAP), 0);
  assert.equal(sliderToGainDb(0.5 - GAIN_CENTER_SNAP), 0);
  assert.ok(sliderToGainDb(0.5 + GAIN_CENTER_SNAP + 0.01) > 0);
  assert.ok(sliderToGainDb(0.5 - GAIN_CENTER_SNAP - 0.01) < 0);
});

test('round trip holds outside the snap zone', () => {
  for (const db of [-60, -48, -24, -6, -3, 3, 6, 9, 12]) {
    const back = sliderToGainDb(gainDbToSlider(db));
    assert.ok(Math.abs(back - db) < 1e-9, `${db} came back as ${back}`);
  }
});

test('cut is monotonic: further left is always quieter', () => {
  let last = Number.POSITIVE_INFINITY;
  for (let p = 1; p >= 0; p -= 0.05) {
    const db = sliderToGainDb(p);
    assert.ok(db <= last);
    last = db;
  }
});

test('garbage in stays inside the range', () => {
  assert.equal(sliderToGainDb(Number.NaN), 0);
  assert.equal(sliderToGainDb(-3), DB_MIN);
  assert.equal(sliderToGainDb(7), DB_MAX);
  assert.equal(gainDbToSlider(Number.NaN), 0);
  assert.equal(gainDbToSlider(500), 1);
});
