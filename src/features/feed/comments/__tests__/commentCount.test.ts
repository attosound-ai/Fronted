import assert from 'node:assert/strict';
import { test } from 'node:test';

import { removedWith } from '../commentCount';

const LIST = [
  { id: 'a', replies: [{ id: 'a1' }, { id: 'a2' }] },
  { id: 'b', replies: [] },
  { id: 'c' },
];

test('a comment leaves with its replies', () => {
  assert.equal(removedWith(LIST, 'a'), 3);
});

test('a comment without replies counts one', () => {
  assert.equal(removedWith(LIST, 'b'), 1);
  assert.equal(removedWith(LIST, 'c'), 1);
});

test('a reply counts one and leaves its comment', () => {
  assert.equal(removedWith(LIST, 'a1'), 1);
});

test('a comment the list does not hold counts one', () => {
  assert.equal(removedWith(LIST, 'zzz'), 1);
  assert.equal(removedWith([], 'a'), 1);
});
