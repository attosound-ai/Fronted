import test from 'node:test';
import assert from 'node:assert/strict';
import { withControls } from '../videoControls';

test('a started video is marked and an ended one is cleared', () => {
  const up = withControls({}, 'm1', true);
  assert.deepEqual(up, { m1: true });
  assert.deepEqual(withControls(up, 'm1', false), {});
});

test('nothing changes when the state is already the one asked for', () => {
  const open = { m1: true as const };
  assert.equal(withControls(open, 'm1', true), open);
  assert.equal(withControls(open, 'm2', false), open);
});

test('one video does not touch another', () => {
  const open = withControls({ m1: true }, 'm2', true);
  assert.deepEqual(open, { m1: true, m2: true });
  assert.deepEqual(withControls(open, 'm1', false), { m2: true });
});

test('a message without an id is ignored', () => {
  const open = {};
  assert.equal(withControls(open, '', true), open);
});
