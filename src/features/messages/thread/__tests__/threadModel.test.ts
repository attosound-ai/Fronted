import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  bubbleCorners,
  dayLabel,
  emojiOnlyCount,
  emojiOnlySize,
  groupPositions,
  needsDayPill,
  RADIUS_INNER,
  RADIUS_OUTER,
  unreadDividerIndex,
  REPLY_SWIPE_BAND_PX,
  REPLY_SWIPE_TRIGGER_OTHER_PX,
  REPLY_SWIPE_TRIGGER_OWN_PX,
  replySwipeTranslation,
  replySwipeTrigger,
  shouldShowJumpPill,
  type ThreadItem,
} from '../threadModel';

const T0 = Date.UTC(2026, 8, 21, 15, 0, 0);
const m = (
  id: string,
  senderId: string,
  offsetSec: number,
  extra: Partial<ThreadItem> = {}
): ThreadItem => ({
  id,
  senderId,
  createdAt: T0 + offsetSec * 1000,
  text: 'hi',
  ...extra,
});

test('consecutive messages from one author within a minute form one group', () => {
  // newest first, as the inverted list holds them
  const items = [m('c', 'a', 40), m('b', 'a', 20), m('a', 'a', 0)];
  assert.deepEqual(groupPositions(items), [
    { first: false, last: true },
    { first: false, last: false },
    { first: true, last: false },
  ]);
});

test('a change of author or a pause over the group window starts a new group', () => {
  // 'c' sits 11 minutes after 'b': past Telegram's 10 minute window.
  const items = [m('d', 'b', 700), m('c', 'a', 670), m('b', 'a', 10), m('a', 'a', 0)];
  assert.deepEqual(groupPositions(items), [
    { first: true, last: true },
    { first: true, last: true },
    { first: false, last: true },
    { first: true, last: false },
  ]);
});

test('a deleted message never joins a group', () => {
  const items = [m('b', 'a', 5), m('a', 'a', 0, { deleted: true })];
  assert.deepEqual(groupPositions(items), [
    { first: true, last: true },
    { first: true, last: true },
  ]);
});

test('corners flatten only on the side facing the author within the run', () => {
  const own = bubbleCorners(true, { first: false, last: false });
  assert.deepEqual(own, {
    topLeft: RADIUS_OUTER,
    bottomLeft: RADIUS_OUTER,
    topRight: RADIUS_INNER,
    bottomRight: RADIUS_INNER,
  });
  const otherFirst = bubbleCorners(false, { first: true, last: false });
  assert.deepEqual(otherFirst, {
    topRight: RADIUS_OUTER,
    bottomRight: RADIUS_OUTER,
    topLeft: RADIUS_OUTER,
    bottomLeft: RADIUS_INNER,
  });
  const solo = bubbleCorners(true, { first: true, last: true });
  assert.ok(Object.values(solo).every((r) => r === RADIUS_OUTER));
});

test('a day pill sits above the oldest loaded item and at every day change', () => {
  const items = [m('c', 'a', 0), m('b', 'a', -3600), m('a', 'a', -90_000)];
  assert.equal(needsDayPill(items, 0), false);
  assert.equal(needsDayPill(items, 1), true);
  assert.equal(needsDayPill(items, 2), true);
  assert.equal(needsDayPill(items, 9), false);
});

test('emoji only messages are detected, capped at three, and sized', () => {
  assert.equal(emojiOnlyCount('🔥'), 1);
  assert.equal(emojiOnlyCount('🔥🔥'), 2);
  assert.equal(emojiOnlyCount(' 👍🏽 '), 1);
  assert.equal(emojiOnlyCount('👨‍👩‍👧'), 1);
  assert.equal(emojiOnlyCount('🇨🇴'), 1);
  assert.equal(emojiOnlyCount('🔥🔥🔥🔥'), 0);
  assert.equal(emojiOnlyCount('nice 🔥'), 0);
  assert.equal(emojiOnlyCount(''), 0);
  assert.equal(emojiOnlyCount('hola'), 0);
  assert.ok(emojiOnlySize(1) > emojiOnlySize(2) && emojiOnlySize(2) > emojiOnlySize(3));
});

test('day labels read Today, Yesterday, a weekday, then a date', () => {
  const words = { today: 'Today', yesterday: 'Yesterday' };
  const now = Date.UTC(2026, 8, 21, 20, 0, 0);
  assert.equal(dayLabel(now - 3_600_000, now, words, 'en-US'), 'Today');
  assert.equal(dayLabel(now - 86_400_000, now, words, 'en-US'), 'Yesterday');
  assert.match(
    dayLabel(now - 3 * 86_400_000, now, words, 'en-US'),
    /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/
  );
  assert.match(
    dayLabel(now - 30 * 86_400_000, now, words, 'en-US'),
    /August \d+|\d+ August/
  );
});

test('the jump pill shows only well away from the bottom', () => {
  assert.equal(shouldShowJumpPill(0), false);
  assert.equal(shouldShowJumpPill(599), false);
  assert.equal(shouldShowJumpPill(601), true);
});

test('swipe to reply follows the finger then rubber bands to a cap', () => {
  const own = replySwipeTrigger(true);
  const other = replySwipeTrigger(false);
  assert.equal(own, REPLY_SWIPE_TRIGGER_OWN_PX);
  assert.equal(other, REPLY_SWIPE_TRIGGER_OTHER_PX);
  assert.ok(own > other);
  assert.equal(replySwipeTranslation(-20, other), 0);
  assert.equal(replySwipeTranslation(30, other), 30);
  assert.equal(replySwipeTranslation(other, other), other);
  assert.ok(replySwipeTranslation(200, other) < 200);
  // Telegram's band: excess of 100 pt lands at 1 - 1/1.4 of the band.
  const at100 = replySwipeTranslation(other + 100, other);
  assert.ok(Math.abs(at100 - (other + (1 - 1 / 1.4) * REPLY_SWIPE_BAND_PX)) < 0.01);
  assert.ok(replySwipeTranslation(10_000, other) < other + REPLY_SWIPE_BAND_PX);
  // Approaches the band asymptotically: 10 000 pt of drag sits at about 97.6.
  assert.ok(replySwipeTranslation(10_000, other) > other + REPLY_SWIPE_BAND_PX - 5);
});

test('unread divider sits above the oldest unread received message', () => {
  const items = [
    { senderId: 'them' }, // newest
    { senderId: 'me' },
    { senderId: 'them' },
    { senderId: 'them' },
    { senderId: 'me' },
  ];
  assert.equal(unreadDividerIndex(items, 'me', 0), null);
  assert.equal(unreadDividerIndex(items, 'me', 1), 0);
  assert.equal(unreadDividerIndex(items, 'me', 2), 2);
  assert.equal(unreadDividerIndex(items, 'me', 3), 3);
  assert.equal(unreadDividerIndex(items, 'me', 4), null);
});

test("the group window is Telegram's ten minutes, exclusive", () => {
  const justUnder = [m('b', 'a', 599), m('a', 'a', 0)];
  assert.deepEqual(groupPositions(justUnder), [
    { first: false, last: true },
    { first: true, last: false },
  ]);
  const exactly = [m('b', 'a', 600), m('a', 'a', 0)];
  assert.deepEqual(groupPositions(exactly), [
    { first: true, last: true },
    { first: true, last: true },
  ]);
});

test('a round video note never joins a run', () => {
  const items = [
    { id: 'c', senderId: 'a', createdAt: 20_000, text: '' },
    { id: 'b', senderId: 'a', createdAt: 10_000, text: '', contentType: 'video_note' },
    { id: 'a', senderId: 'a', createdAt: 0, text: 'hola' },
  ];
  assert.deepEqual(groupPositions(items), [
    { first: true, last: true },
    { first: true, last: true },
    { first: true, last: true },
  ]);
});
