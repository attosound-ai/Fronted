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
