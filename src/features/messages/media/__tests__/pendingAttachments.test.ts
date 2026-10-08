import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { OutgoingMedia } from '../outgoingMedia';
import {
  MAX_PENDING_ATTACHMENTS,
  addPending,
  makePending,
  planAttachmentSend,
  removePending,
  type PendingAttachment,
} from '../pendingAttachments';

const img = (uri: string): OutgoingMedia => ({ kind: 'image', uri });
const vid = (uri: string): OutgoingMedia => ({ kind: 'video', uri });
const tray = (...medias: OutgoingMedia[]): PendingAttachment[] => medias.map(makePending);

test('a picked photo waits in the tray instead of being sent', () => {
  const { next, added, overflow } = addPending([], [img('a.jpg')]);
  assert.equal(added, 1);
  assert.equal(overflow, false);
  assert.equal(next.length, 1);
  assert.equal(next[0].media.uri, 'a.jpg');
  assert.ok(next[0].id);
});

test('ids are unique so two of the same picture can both sit in the tray', () => {
  const { next } = addPending([], [img('a.jpg'), img('a.jpg')]);
  assert.notEqual(next[0].id, next[1].id);
});

test('the caption rides on the last attachment only', () => {
  const plan = planAttachmentSend(tray(img('a.jpg'), img('b.jpg'), vid('c.mp4')), 'look');
  assert.deepEqual(
    plan.map((p) => p.caption),
    [undefined, undefined, 'look']
  );
  assert.deepEqual(
    plan.map((p) => p.media.uri),
    ['a.jpg', 'b.jpg', 'c.mp4']
  );
});

test('one attachment with a caption is one bubble with the text', () => {
  const plan = planAttachmentSend(tray(img('a.jpg')), 'hi');
  assert.equal(plan.length, 1);
  assert.equal(plan[0].caption, 'hi');
});

test('a blank or empty caption rides on nothing', () => {
  for (const blank of ['', '   ', '\n\t']) {
    const plan = planAttachmentSend(tray(img('a.jpg'), img('b.jpg')), blank);
    assert.deepEqual(
      plan.map((p) => p.caption),
      [undefined, undefined]
    );
  }
});

test('the caption is trimmed before it is sent', () => {
  const plan = planAttachmentSend(tray(img('a.jpg')), '  spaced out  ');
  assert.equal(plan[0].caption, 'spaced out');
});

test('an empty tray plans nothing, even with a caption', () => {
  assert.deepEqual(planAttachmentSend([], 'orphan'), []);
});

test('the tray stops at the cap and reports the overflow', () => {
  const many = Array.from({ length: MAX_PENDING_ATTACHMENTS + 3 }, (_, i) => img(`${i}.jpg`));
  const { next, added, overflow } = addPending([], many);
  assert.equal(next.length, MAX_PENDING_ATTACHMENTS);
  assert.equal(added, MAX_PENDING_ATTACHMENTS);
  assert.equal(overflow, true);
});

test('a full tray takes nothing more and says so', () => {
  const full = tray(...Array.from({ length: MAX_PENDING_ATTACHMENTS }, (_, i) => img(`${i}.jpg`)));
  const { next, added, overflow } = addPending(full, [img('one-more.jpg')]);
  assert.equal(next, full);
  assert.equal(added, 0);
  assert.equal(overflow, true);
});

test('removing an attachment leaves the others in order', () => {
  const t = tray(img('a.jpg'), img('b.jpg'), img('c.jpg'));
  const next = removePending(t, t[1].id);
  assert.deepEqual(
    next.map((a) => a.media.uri),
    ['a.jpg', 'c.jpg']
  );
});
