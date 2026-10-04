import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InviteSiblings, siblingKey, type InviteLike } from '../inviteSiblings';

const inv = (callSid: string, params: Record<string, string> = {}, from = '+18607831309'): InviteLike => ({
  callSid,
  from,
  params,
});

test('parent call sid groups the invites of one call', () => {
  assert.equal(siblingKey(inv('CA1', { ParentCallSid: 'CAp' })), siblingKey(inv('CA2', { ParentCallSid: 'CAp' })));
  assert.notEqual(siblingKey(inv('CA1', { ParentCallSid: 'CAp' })), siblingKey(inv('CA2', { ParentCallSid: 'CAq' })));
});

test('older bridges without parent fall back to caller and target', () => {
  assert.equal(siblingKey(inv('CA1', { TargetUserId: '281' })), siblingKey(inv('CA2', { TargetUserId: '281' })));
  assert.notEqual(siblingKey(inv('CA1', { TargetUserId: '281' })), siblingKey(inv('CA2', { TargetUserId: '265' })));
});

test('declining one returns the other invite of the same call (Oct 3: busy at 7 s, other rang to 35 s)', () => {
  const r = new InviteSiblings<string>();
  const a = inv('CArep', { ParentCallSid: 'CAp', TargetUserId: '281' });
  const b = inv('CAcreator', { ParentCallSid: 'CAp', TargetUserId: '281' });
  r.add(a, 'rep');
  r.add(b, 'creator');
  assert.deepEqual(r.declineAndTakeSiblings(b), ['rep']);
  assert.equal(r.size(), 0);
});

test('a different call ringing at the same time is never rejected', () => {
  const r = new InviteSiblings<string>();
  r.add(inv('CA1', { ParentCallSid: 'CAp' }), 'one');
  r.add(inv('CA2', { ParentCallSid: 'CAother' }), 'other');
  assert.deepEqual(r.declineAndTakeSiblings(inv('CA1', { ParentCallSid: 'CAp' })), []);
  assert.equal(r.size(), 1);
});

test('a sibling arriving after the decline is recognised for 60 s only', () => {
  const r = new InviteSiblings<string>();
  r.declineAndTakeSiblings(inv('CA1', { ParentCallSid: 'CAp' }), 1_000);
  assert.equal(r.wasDeclined(inv('CA2', { ParentCallSid: 'CAp' }), 30_000), true);
  assert.equal(r.wasDeclined(inv('CA2', { ParentCallSid: 'CAp' }), 61_000), false);
});

test('a new call from the same bridge later is not treated as declined', () => {
  const r = new InviteSiblings<string>();
  r.declineAndTakeSiblings(inv('CA1', { ParentCallSid: 'CAp' }), 0);
  assert.equal(r.wasDeclined(inv('CA9', { ParentCallSid: 'CAnew' }), 5_000), false);
});

test('siblingsOf does not remove and excludes itself', () => {
  const r = new InviteSiblings<string>();
  const a = inv('CA1', { ParentCallSid: 'CAp' });
  r.add(a, 'a');
  r.add(inv('CA2', { ParentCallSid: 'CAp' }), 'b');
  assert.deepEqual(r.siblingsOf(a), ['b']);
  assert.equal(r.size(), 2);
});

test('remove forgets an answered or cancelled invite', () => {
  const r = new InviteSiblings<string>();
  r.add(inv('CA1', { ParentCallSid: 'CAp' }), 'a');
  r.remove('CA1');
  assert.equal(r.size(), 0);
});
