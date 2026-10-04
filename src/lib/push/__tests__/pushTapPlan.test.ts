import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planPushTap, type PushTapInput } from '../pushTapPlan';

const base: PushTapInput = {
  alreadyHandled: false,
  url: '/chat?conversationId=ceb7eb06&participantName=arami',
  accountId: '152',
  activeAccountId: 152,
  linkedAccountIds: [152, 153],
};

test('tap for the active account opens directly', () => {
  assert.deepEqual(planPushTap(base), { kind: 'open', url: base.url });
});

test('a replayed tap never opens a second copy (triple messages, Oct 3)', () => {
  assert.deepEqual(planPushTap({ ...base, alreadyHandled: true }), { kind: 'replay_skipped' });
});

test('replay is skipped even when the active account changed meanwhile', () => {
  assert.deepEqual(
    planPushTap({ ...base, alreadyHandled: true, activeAccountId: 153 }),
    { kind: 'replay_skipped' }
  );
});

test('tap for another linked account switches before opening', () => {
  assert.deepEqual(planPushTap({ ...base, activeAccountId: 153 }), {
    kind: 'switch_then_open',
    url: base.url,
    accountId: 152,
  });
});

test('numeric account id works the same as a string', () => {
  assert.equal(planPushTap({ ...base, accountId: 152, activeAccountId: 153 }).kind, 'switch_then_open');
});

test('tap for an account no longer on the device opens nothing', () => {
  assert.deepEqual(planPushTap({ ...base, accountId: '999' }), {
    kind: 'recipient_not_on_device',
    url: base.url,
    accountId: 999,
  });
});

test('push without account id keeps the old behaviour', () => {
  assert.deepEqual(planPushTap({ ...base, accountId: undefined, activeAccountId: 153 }), {
    kind: 'open',
    url: base.url,
  });
});

test('garbage account id is treated as missing', () => {
  for (const accountId of ['', 'abc', '-3', '0', '1.5', null]) {
    assert.equal(planPushTap({ ...base, accountId, activeAccountId: 153 }).kind, 'open', String(accountId));
  }
});

test('no url means nothing to open', () => {
  assert.deepEqual(planPushTap({ ...base, url: undefined }), { kind: 'no_url' });
  assert.deepEqual(planPushTap({ ...base, url: '' }), { kind: 'no_url' });
  assert.deepEqual(planPushTap({ ...base, url: 42 }), { kind: 'no_url' });
});

test('no active account yet (cold start) with a linked recipient switches', () => {
  assert.equal(planPushTap({ ...base, activeAccountId: null }).kind, 'switch_then_open');
});
