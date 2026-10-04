import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTestBridgeNumber } from '../testNumber';

test('Twilio magic numbers in every common format', () => {
  for (const n of ['+15005553811', '15005550006', '5005551167', '+1 (500) 555-0006', '+1 500 555 3811']) {
    assert.equal(isTestBridgeNumber(n), true, n);
  }
});

test('real numbers, including ones that contain 500555 later, are not test numbers', () => {
  for (const n of ['+18607831309', '+14752701681', '+19592100804', '+18605005550', '+1 860 500 5551']) {
    assert.equal(isTestBridgeNumber(n), false, n);
  }
});

test('empty values are not test numbers', () => {
  assert.equal(isTestBridgeNumber(null), false);
  assert.equal(isTestBridgeNumber(undefined), false);
  assert.equal(isTestBridgeNumber(''), false);
});
