import { test } from 'node:test';
import assert from 'node:assert/strict';

import { judgeUnadoptedCall, UNADOPTED_GRACE_MS } from '../unadoptedCall';

const NOW_S = 1_791_874_000;
const NOW_MS = NOW_S * 1000;

test('no live CallKit call: nothing to judge', () => {
  assert.deepEqual(judgeUnadoptedCall(null, NOW_MS), { kind: 'none' });
  assert.deepEqual(
    judgeUnadoptedCall({ liveCallKitCalls: 0, coldAcceptAt: NOW_S - 30 }, NOW_MS),
    {
      kind: 'none',
    }
  );
});

test('Oct 12 2026: a call still ringing (never answered) is not reported', () => {
  const v = judgeUnadoptedCall(
    { liveCallKitCalls: 1, voipPushAt: NOW_S - 8, coldInviteDecodedAt: NOW_S - 8 },
    NOW_MS
  );
  assert.deepEqual(v, { kind: 'ringing' });
});

test('fix47: answered 0.45 s ago waits out the grace window instead of reporting', () => {
  const v = judgeUnadoptedCall(
    { liveCallKitCalls: 1, voipPushAt: NOW_S - 9, coldAcceptAt: NOW_S - 0.45 },
    NOW_MS
  );
  assert.equal(v.kind, 'grace');
  assert.ok(v.kind === 'grace' && Math.abs(v.waitMs - (UNADOPTED_GRACE_MS - 450)) < 1);
});

test("fix48: the previous call's answer 42 s ago does not count for the call ringing now", () => {
  const v = judgeUnadoptedCall(
    {
      liveCallKitCalls: 1,
      // previous call: answered 42 s ago
      coldAcceptAt: NOW_S - 42,
      coldAnswerActionAt: NOW_S - 42,
      // this call: push 8 s ago, still ringing
      voipPushAt: NOW_S - 8,
      coldInviteDecodedAt: NOW_S - 8,
    },
    NOW_MS
  );
  assert.deepEqual(v, { kind: 'ringing' });
});

test('Voss, Oct 6: answered 20 s ago and never adopted is reported', () => {
  const v = judgeUnadoptedCall(
    { liveCallKitCalls: 1, voipPushAt: NOW_S - 30, answerActionAt: NOW_S - 20 },
    NOW_MS
  );
  assert.deepEqual(v, { kind: 'report', msSinceAnswer: 20_000 });
});

test('an answer older than two minutes is stale even without a push marker', () => {
  const v = judgeUnadoptedCall(
    { liveCallKitCalls: 1, coldAcceptAt: NOW_S - 600 },
    NOW_MS
  );
  assert.deepEqual(v, { kind: 'ringing' });
});

test('builds without push markers still judge by the answer alone', () => {
  const v = judgeUnadoptedCall({ liveCallKitCalls: 1, coldAcceptAt: NOW_S - 10 }, NOW_MS);
  assert.deepEqual(v, { kind: 'report', msSinceAnswer: 10_000 });
});
