import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isAlreadyOnPhone, resolveAttempt, slotFromNative } from '../appIconModel';

test('native names become slots', () => {
  assert.equal(slotFromNative('AppIcon-diamond'), 'diamond');
  assert.equal(slotFromNative('studio'), 'studio');
});

test('every way the system says "primary icon" is the default slot', () => {
  for (const v of ['DEFAULT', '', '<nil>', null, undefined])
    assert.equal(slotFromNative(v), null);
});

test('the client case: the app remembered studio, the phone shows diamond, tapping Studio must act', () => {
  assert.equal(isAlreadyOnPhone('studio', slotFromNative('AppIcon-diamond')), false);
});

test('tapping the icon the phone already shows is the only no op', () => {
  assert.equal(isAlreadyOnPhone('studio', 'studio'), true);
  assert.equal(isAlreadyOnPhone(null, null), true);
  assert.equal(isAlreadyOnPhone(null, 'studio'), false);
});

test('a change that applied is a success and the picker shows it', () => {
  assert.deepEqual(resolveAttempt('gold', 'gold'), { selected: 'gold', applied: true });
  assert.deepEqual(resolveAttempt(null, null), { selected: null, applied: true });
});

test('a change the system did not apply leaves the picker on what the phone really has', () => {
  assert.deepEqual(resolveAttempt('diamond', 'studio'), {
    selected: 'studio',
    applied: false,
  });
});

test('telemetry of Oct 6: asked platinum, the phone ended on diamond, the picker must say diamond and not studio', () => {
  assert.deepEqual(resolveAttempt('platinum', slotFromNative('AppIcon-diamond')), {
    selected: 'diamond',
    applied: false,
  });
});
