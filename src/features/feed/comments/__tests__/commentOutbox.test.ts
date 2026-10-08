import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  countedPending,
  enqueue,
  find,
  markFailed,
  markRetrying,
  newPendingComment,
  outboxSlot,
  pendingFor,
  remove,
  type Outbox,
} from '../commentOutbox';

const POST_ID = '6ac6c4eeefc6bc677c7ee9da';
// The account that writes in these cases: the client's representative account.
const ACCOUNT = '152';
/** Where that account's comments on that post wait. */
const POST = outboxSlot(ACCOUNT, POST_ID);
const NOW = Date.parse('2026-10-07T22:18:48Z');

function written(text: string, at = NOW, postId = POST_ID, account = ACCOUNT) {
  return newPendingComment(account, postId, text, null, at);
}

test('the reported case: a comment that times out stays, with its text', () => {
  const first = written(
    'Stay far far away. Negativity is poison and it is quite infectious.'
  );
  let box: Outbox = enqueue({}, first);
  assert.equal(pendingFor(box, POST)[0].status, 'sending');
  // Fifteen seconds later the request gives up.
  box = markFailed(box, POST, first.id);
  const kept = pendingFor(box, POST);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].status, 'failed');
  assert.equal(
    kept[0].text,
    'Stay far far away. Negativity is poison and it is quite infectious.'
  );
});

test('a second comment written after a failed one sits above it, both kept', () => {
  const first = written('first', NOW);
  const second = written('Where am I commenting?', NOW + 30_000);
  let box = markFailed(enqueue({}, first), POST, first.id);
  box = markFailed(enqueue(box, second), POST, second.id);
  assert.deepEqual(
    pendingFor(box, POST).map((c) => [c.text, c.status]),
    [
      ['Where am I commenting?', 'failed'],
      ['first', 'failed'],
    ]
  );
});

test('retry puts a failed comment back on its way and counts the attempt', () => {
  const c = written('hello');
  let box = markFailed(enqueue({}, c), POST, c.id);
  box = markRetrying(box, POST, c.id);
  assert.equal(find(box, POST, c.id)?.status, 'sending');
  assert.equal(find(box, POST, c.id)?.attempts, 2);
});

test('a comment already on its way is never sent twice', () => {
  const c = written('hello');
  const box = enqueue({}, c);
  // A double tap on retry, or a retry while the first request is still out.
  assert.equal(markRetrying(box, POST, c.id), box);
  assert.equal(find(box, POST, c.id)?.attempts, 1);
});

test('sent or discarded, it leaves; the post entry goes with its last comment', () => {
  const a = written('a', NOW);
  const b = written('b', NOW + 1);
  let box = enqueue(enqueue({}, a), b);
  box = remove(box, POST, a.id);
  assert.deepEqual(
    pendingFor(box, POST).map((c) => c.text),
    ['b']
  );
  box = remove(box, POST, b.id);
  assert.deepEqual(box, {});
  assert.deepEqual(pendingFor(box, POST), []);
});

test('unknown ids change nothing, and return the same object', () => {
  const c = written('hello');
  const box = enqueue({}, c);
  assert.equal(markFailed(box, POST, 'nope'), box);
  assert.equal(markRetrying(box, POST, 'nope'), box);
  assert.equal(remove(box, POST, 'nope'), box);
  assert.equal(remove(box, 'other-post', c.id), box);
  assert.equal(find(box, POST, 'nope'), null);
});

test('one post never shows the pending comments of another', () => {
  const here = written('here');
  const there = written('there', NOW, 'another-post');
  const box = enqueue(enqueue({}, here), there);
  assert.deepEqual(
    pendingFor(box, POST).map((c) => c.text),
    ['here']
  );
  assert.deepEqual(
    pendingFor(box, outboxSlot(ACCOUNT, 'another-post')).map((c) => c.text),
    ['there']
  );
});

// A phone holds several accounts (the client's: a representative, 152, and
// the creator it manages, 153) and switches between them at a tap.
test('a comment that failed as one account is not shown to the other account of the phone', () => {
  const asRep = written('from the representative');
  let box = markFailed(enqueue({}, asRep), POST, asRep.id);

  const creatorSlot = outboxSlot('153', POST_ID);
  assert.deepEqual(pendingFor(box, creatorSlot), []);
  assert.equal(countedPending(box, creatorSlot), 0);
  // The creator cannot send it again or discard it: it is not theirs.
  assert.equal(find(box, creatorSlot, asRep.id), null);
  assert.equal(markRetrying(box, creatorSlot, asRep.id), box);
  assert.equal(remove(box, creatorSlot, asRep.id), box);

  // Back on the representative's account it is still there, to send again.
  assert.deepEqual(
    pendingFor(box, POST).map((c) => [c.text, c.status, c.accountId]),
    [['from the representative', 'failed', '152']]
  );
  box = markRetrying(box, POST, asRep.id);
  assert.equal(find(box, POST, asRep.id)?.status, 'sending');
});

test('each account has its own comments on the same post', () => {
  const asRep = written('mine');
  const asCreator = written('also mine', NOW + 5, POST_ID, '153');
  const box = enqueue(enqueue({}, asRep), asCreator);

  assert.deepEqual(
    pendingFor(box, POST).map((c) => c.text),
    ['mine']
  );
  assert.deepEqual(
    pendingFor(box, outboxSlot('153', POST_ID)).map((c) => c.text),
    ['also mine']
  );
  assert.equal(countedPending(box, POST), 1);
});

test('an account id given as a number is the same account', () => {
  const c = newPendingComment(152, POST_ID, 'x', null, NOW);
  assert.equal(c.accountId, '152');
  assert.equal(outboxSlot(152, POST_ID), POST);
});

test('the number under the post counts what is on its way, not what failed', () => {
  const a = written('a', NOW);
  const b = written('b', NOW + 1);
  let box = enqueue(enqueue({}, a), b);
  assert.equal(countedPending(box, POST), 2);
  box = markFailed(box, POST, a.id);
  assert.equal(countedPending(box, POST), 1);
  box = markRetrying(box, POST, a.id);
  assert.equal(countedPending(box, POST), 2);
});

test('a reply keeps the comment it answers; ids are unique for fast typists', () => {
  const reply = newPendingComment(ACCOUNT, POST_ID, 'me too', 'parent-1', NOW);
  assert.equal(reply.parentId, 'parent-1');
  assert.equal(written('x').parentId, null);
  const ids = new Set(Array.from({ length: 50 }, () => written('same instant').id));
  assert.ok(ids.size > 45);
  assert.ok([...ids].every((id) => id.startsWith('temp-')));
});
