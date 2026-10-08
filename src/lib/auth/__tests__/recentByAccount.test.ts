import assert from 'node:assert/strict';
import { test } from 'node:test';

import { forget, recall, remember, type Recent } from '../recentByAccount';

const MIN = 60_000;

test('what was kept for an account comes back for that account only', () => {
  let book: Recent<string> = {};
  book = remember(book, 152, 'plan del representante', 1000, 3);
  book = remember(book, 153, 'plan del creador', 2000, 3);

  assert.equal(recall(book, 152, 3000, 10 * MIN), 'plan del representante');
  assert.equal(recall(book, 153, 3000, 10 * MIN), 'plan del creador');
  assert.equal(recall(book, 300, 3000, 10 * MIN), null);
});

test('a number and its text are the same account', () => {
  const book = remember<string>({}, 152, 'a', 1000, 3);
  assert.equal(recall(book, '152', 2000, MIN), 'a');
});

test('an entry older than the limit is not shown', () => {
  const book = remember<string>({}, 152, 'viejo', 0, 3);
  assert.equal(recall(book, 152, 10 * MIN, 10 * MIN), 'viejo');
  assert.equal(recall(book, 152, 10 * MIN + 1, 10 * MIN), null);
});

test('writing again replaces the entry and its age', () => {
  let book = remember<string>({}, 152, 'uno', 0, 3);
  book = remember(book, 152, 'dos', 5 * MIN, 3);
  assert.equal(recall(book, 152, 12 * MIN, 10 * MIN), 'dos');
  assert.equal(Object.keys(book).length, 1);
});

test('beyond the limit the oldest accounts are dropped', () => {
  let book: Recent<string> = {};
  book = remember(book, 1, 'a', 100, 3);
  book = remember(book, 2, 'b', 200, 3);
  book = remember(book, 3, 'c', 300, 3);
  book = remember(book, 1, 'a2', 400, 3);
  book = remember(book, 4, 'd', 500, 3);

  assert.deepEqual(Object.keys(book).sort(), ['1', '3', '4']);
  assert.equal(recall(book, 2, 600, MIN), null);
  assert.equal(recall(book, 1, 600, MIN), 'a2');
});

test('the book that is passed in is never changed', () => {
  const before = remember<string>({}, 152, 'a', 0, 3);
  const copy = JSON.stringify(before);
  remember(before, 153, 'b', 1, 3);
  remember(before, 152, 'c', 2, 3);
  forget(before, 152);
  assert.equal(JSON.stringify(before), copy);
});

test('forgetting an account leaves the others, and an unknown one changes nothing', () => {
  let book = remember<string>({}, 152, 'a', 0, 3);
  book = remember(book, 153, 'b', 1, 3);

  const less = forget(book, 152);

  assert.equal(recall(less, 152, 2, MIN), null);
  assert.equal(recall(less, 153, 2, MIN), 'b');
  assert.equal(forget(less, 999), less);
});
