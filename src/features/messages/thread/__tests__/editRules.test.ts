import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editAvailability, editToSave, EDIT_WINDOW_MS, MAX_EDITS } from '../editRules';

const sent = Date.parse('2026-10-04T12:00:00Z');
const own = { isOwn: true, contentType: 'text', createdAt: sent, editHistory: [] };

test('own fresh text message can be edited, 5 edits left', () => {
  assert.deepEqual(editAvailability(own, sent + 1000), { ok: true, editsLeft: MAX_EDITS });
});

test('only the sender', () => {
  assert.deepEqual(editAvailability({ ...own, isOwn: false }, sent), { ok: false, reason: 'not_own' });
});

test('exactly 15 minutes is still allowed, one ms later is not', () => {
  assert.equal(editAvailability(own, sent + EDIT_WINDOW_MS).ok, true);
  assert.deepEqual(editAvailability(own, sent + EDIT_WINDOW_MS + 1), { ok: false, reason: 'window_closed' });
});

test('fifth edit allowed, sixth refused', () => {
  const four = { ...own, editHistory: [1, 2, 3, 4] };
  const five = { ...own, editHistory: [1, 2, 3, 4, 5] };
  assert.deepEqual(editAvailability(four, sent), { ok: true, editsLeft: 1 });
  assert.deepEqual(editAvailability(five, sent), { ok: false, reason: 'limit_reached' });
});

test('media, deleted, unsent and undated messages are not editable', () => {
  assert.equal((editAvailability({ ...own, contentType: 'image' }, sent) as any).reason, 'not_text');
  assert.equal((editAvailability({ ...own, isDeleted: true }, sent) as any).reason, 'deleted');
  assert.equal((editAvailability({ ...own, status: 'sending' as const }, sent) as any).reason, 'pending');
  assert.equal((editAvailability({ ...own, status: 'failed' as const }, sent) as any).reason, 'pending');
  assert.equal((editAvailability({ ...own, createdAt: null }, sent) as any).reason, 'window_closed');
});

test('a Date or ISO string works as created time', () => {
  assert.equal(editAvailability({ ...own, createdAt: new Date(sent) }, sent).ok, true);
  assert.equal(editAvailability({ ...own, createdAt: '2026-10-04T12:00:00Z' }, sent).ok, true);
});

test('nothing to save when empty or unchanged', () => {
  assert.equal(editToSave('hola', ''), null);
  assert.equal(editToSave('hola', '   '), null);
  assert.equal(editToSave('hola', 'hola  '), null);
  assert.equal(editToSave('hola', 'hola!'), 'hola!');
  assert.equal(editToSave('hola', '  nuevo texto  '), 'nuevo texto');
});
