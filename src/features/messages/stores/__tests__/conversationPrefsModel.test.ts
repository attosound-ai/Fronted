import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isArchived, orderConversations } from '../conversationPrefsModel';

const conv = (id: string, at: string | null) => ({
  conversationId: id,
  lastMessageAt: at,
});

test('pinned conversations sort first, newest pin on top, then by activity', () => {
  const list = [
    conv('a', '2026-09-21T10:00:00Z'),
    conv('b', '2026-09-21T12:00:00Z'),
    conv('c', '2026-09-21T11:00:00Z'),
    conv('d', null),
  ];
  const ordered = orderConversations(list, { c: 100, a: 200 });
  assert.deepEqual(
    ordered.map((c) => c.conversationId),
    ['a', 'c', 'b', 'd']
  );
});

test('orderConversations does not mutate its input', () => {
  const list = [conv('a', '2026-09-21T10:00:00Z'), conv('b', '2026-09-21T12:00:00Z')];
  orderConversations(list, {});
  assert.equal(list[0].conversationId, 'a');
});

test('an archived conversation stays hidden until something newer arrives', () => {
  const archived = { x: { lastMessageAt: '2026-09-21T10:00:00Z', archivedAt: 1 } };
  assert.equal(isArchived(archived, 'x', '2026-09-21T10:00:00Z'), true);
  assert.equal(isArchived(archived, 'x', '2026-09-21T09:00:00Z'), true);
  assert.equal(isArchived(archived, 'x', '2026-09-21T10:00:01Z'), false);
  assert.equal(isArchived(archived, 'y', '2026-09-21T10:00:00Z'), false);
});

test('archiving a conversation with no messages hides it until a first message', () => {
  const archived = { x: { lastMessageAt: null, archivedAt: 1 } };
  assert.equal(isArchived(archived, 'x', null), true);
  assert.equal(isArchived(archived, 'x', '2026-09-21T10:00:00Z'), true);
});

// ── Drafts per account (Oct 5 2026) ──
import { draftKey, dropLegacyDrafts, draftToStore } from '../conversationPrefsModel';

test('two accounts sharing a conversation get different draft keys', () => {
  const conv = 'bd188e5d-8eea-45be-ab14-b4894a67ef5d';
  assert.notEqual(draftKey(280, conv), draftKey(281, conv));
  assert.equal(draftKey('280', conv), draftKey(280, conv));
});

test('no account yet still yields a usable key that no real account matches', () => {
  assert.equal(draftKey(null, 'c1'), 'anon:c1');
  assert.equal(draftKey(undefined, 'c1'), 'anon:c1');
  assert.equal(draftKey('', 'c1'), 'anon:c1');
  assert.notEqual(draftKey(0, 'c1'), 'anon:c1');
});

test('drafts saved before the account was in the key are dropped', () => {
  assert.deepEqual(
    dropLegacyDrafts({ 'bd188e5d-8eea': 'viejo', '280:bd188e5d-8eea': 'mio' }),
    { '280:bd188e5d-8eea': 'mio' }
  );
  assert.deepEqual(dropLegacyDrafts({}), {});
});

test('text loaded by Edit is never stored as a draft', () => {
  // David, Oct 5: the old message came back as unsent text in the other account.
  assert.equal(draftToStore('QA push 22:41:59: de westcol', true, null), '');
  assert.equal(draftToStore('mensaje editado', true, 'lo que estaba escribiendo'), 'lo que estaba escribiendo');
  assert.equal(draftToStore('sigo escribiendo', false, null), 'sigo escribiendo');
});
