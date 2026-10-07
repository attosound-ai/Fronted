import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  clientKeyFor,
  rememberClientKey,
  resetClientKeys,
  stableClientKey,
} from '../clientKeys';

beforeEach(() => resetClientKeys());

test('a row keeps its key through send, confirmation and reload', () => {
  // The optimistic row: its id is its own client key, nothing to remember yet.
  assert.equal(stableClientKey({ messageId: 'temp-1', clientKey: 'temp-1' }), 'temp-1');
  assert.equal(clientKeyFor('temp-1'), undefined);
  // The server's copy replaces it and still carries the client key.
  assert.equal(stableClientKey({ messageId: 'real-1', clientKey: 'temp-1' }), 'temp-1');
  // The thread reloads: the copy from the server has no client key any more.
  assert.equal(stableClientKey({ messageId: 'real-1' }), 'temp-1');
  assert.equal(stableClientKey({ messageId: 'real-1', clientKey: null }), 'temp-1');
});

test('a message from someone else has no client key, before or after', () => {
  assert.equal(stableClientKey({ messageId: 'real-9' }), undefined);
  assert.equal(stableClientKey({ messageId: 'real-9' }), undefined);
});

test('nothing is remembered for empty or self referring ids', () => {
  rememberClientKey('', 'temp-2');
  rememberClientKey('real-2', '');
  rememberClientKey('real-2', null);
  rememberClientKey('temp-2', 'temp-2');
  assert.equal(clientKeyFor('real-2'), undefined);
  assert.equal(clientKeyFor('temp-2'), undefined);
  assert.equal(clientKeyFor(null), undefined);
});

test('the memory is bounded: the oldest ids fall off', () => {
  for (let i = 0; i < 520; i += 1) rememberClientKey(`real-${i}`, `temp-${i}`);
  assert.equal(clientKeyFor('real-0'), undefined);
  assert.equal(clientKeyFor('real-19'), undefined);
  assert.equal(clientKeyFor('real-20'), 'temp-20');
  assert.equal(clientKeyFor('real-519'), 'temp-519');
});
