import { test } from 'node:test';
import assert from 'node:assert/strict';

import { decideLanding, type LandingInput } from '../callLandingModel';

/** A connected inbound call to a subscribed creator, on the feed, pad down. */
function base(over: Partial<LandingInput> = {}): LandingInput {
  return {
    connected: true,
    callSid: 'CA1',
    direction: 'inbound',
    dtmfSentSid: null,
    autoLandEnabled: true,
    appActive: true,
    navReady: true,
    keypadUp: false,
    pathname: '/',
    role: 'creator',
    recordUpload: true,
    subscriptionFetchFailed: false,
    alreadyFetchedSubscription: false,
    alreadySentHome: false,
    alreadyLanded: false,
    ...over,
  };
}

// ── No call ──────────────────────────────────────────────────────────────

test('no call at all does nothing', () => {
  assert.deepEqual(decideLanding(base({ connected: false })), {
    kind: 'idle',
    reason: 'no_call',
  });
  assert.deepEqual(decideLanding(base({ callSid: null })), {
    kind: 'idle',
    reason: 'no_call',
  });
});

test('a call that already landed never lands twice', () => {
  assert.equal(decideLanding(base({ alreadyLanded: true })).kind, 'idle');
});

// ── The flag ─────────────────────────────────────────────────────────────

test('with the recorder flag off nothing opens, whatever else is true', () => {
  const d = decideLanding(base({ autoLandEnabled: false, dtmfSentSid: 'CA1' }));
  assert.deepEqual(d, { kind: 'idle', reason: 'flag_off' });
});

// ── The phone is not in front of the user ────────────────────────────────

test('answered on the lock screen: wait, do not navigate behind the lock', () => {
  assert.deepEqual(decideLanding(base({ appActive: false })), {
    kind: 'wait',
    reason: 'not_active',
  });
});

test('a cold launch whose navigator is not ready waits for it', () => {
  assert.deepEqual(decideLanding(base({ navReady: false })), {
    kind: 'wait',
    reason: 'nav_not_ready',
  });
});

test('the lock screen answer outranks the missing navigator', () => {
  assert.equal(
    decideLanding(base({ appActive: false, navReady: false })).reason,
    'not_active'
  );
});

// ── The keypad owns the screen ───────────────────────────────────────────

test('nothing moves while the keypad is up, even with the digit already sent', () => {
  assert.deepEqual(decideLanding(base({ keypadUp: true, dtmfSentSid: 'CA1' })), {
    kind: 'wait',
    reason: 'keypad_open',
  });
});

test('the keypad outranks a stray screen', () => {
  assert.equal(
    decideLanding(base({ keypadUp: true, pathname: '/project/7' })).reason,
    'keypad_open'
  );
});

// ── Inbound before the digit ─────────────────────────────────────────────

test('an inbound call on a stray screen goes home once, then waits', () => {
  const stray = base({ pathname: '/project/7' });
  assert.deepEqual(decideLanding(stray), { kind: 'home', reason: 'stray_screen' });
  assert.deepEqual(decideLanding({ ...stray, alreadySentHome: true }), {
    kind: 'wait',
    reason: 'awaiting_digit',
  });
});

test('an inbound call already on the feed just waits for the digit', () => {
  assert.deepEqual(decideLanding(base({ pathname: '/' })), {
    kind: 'wait',
    reason: 'awaiting_digit',
  });
});

test('the call screen and the recorder are never sent home', () => {
  for (const pathname of ['/call', '/(tabs)/recording', '/recording']) {
    assert.equal(decideLanding(base({ pathname })).reason, 'awaiting_digit', pathname);
  }
});

test('a digit for a different call does not count', () => {
  assert.equal(decideLanding(base({ dtmfSentSid: 'CA-other' })).reason, 'awaiting_digit');
});

// ── Inbound after the digit ──────────────────────────────────────────────

test('the digit opens the recorder', () => {
  assert.deepEqual(decideLanding(base({ dtmfSentSid: 'CA1' })), {
    kind: 'land',
    reason: 'reached_record',
  });
});

test('after the digit, being already on the target is the end of it', () => {
  for (const pathname of ['/call', '/(tabs)/recording']) {
    assert.deepEqual(
      decideLanding(base({ dtmfSentSid: 'CA1', pathname })),
      { kind: 'idle', reason: 'already_on_target' },
      pathname
    );
  }
});

// ── Outbound ─────────────────────────────────────────────────────────────

test('an outbound call needs no digit and lands straight away', () => {
  assert.deepEqual(decideLanding(base({ direction: 'outbound' })), {
    kind: 'land',
    reason: 'reached_record',
  });
});

test('a call with no known direction behaves like an outbound one', () => {
  assert.equal(decideLanding(base({ direction: null })).kind, 'land');
});

// ── Who the user is ──────────────────────────────────────────────────────

test('only a creator is taken to the recorder', () => {
  for (const role of ['listener', 'representative', null, undefined]) {
    assert.deepEqual(
      decideLanding(base({ dtmfSentSid: 'CA1', role })),
      { kind: 'idle', reason: 'not_creator' },
      String(role)
    );
  }
});

test('a creator without the entitlement is left where they are', () => {
  assert.deepEqual(decideLanding(base({ dtmfSentSid: 'CA1', recordUpload: false })), {
    kind: 'idle',
    reason: 'no_entitlement',
  });
});

// ── The subscription race on a cold launch ───────────────────────────────

test('an unresolved subscription is asked for once, then waited on', () => {
  const unknown = base({ dtmfSentSid: 'CA1', recordUpload: null });
  assert.deepEqual(decideLanding(unknown), {
    kind: 'fetchSubscription',
    reason: 'subscription_unknown',
  });
  assert.deepEqual(decideLanding({ ...unknown, alreadyFetchedSubscription: true }), {
    kind: 'wait',
    reason: 'sub_unresolved',
  });
});

test('a failed subscription fetch lands the creator instead of stranding them', () => {
  assert.deepEqual(
    decideLanding(
      base({
        dtmfSentSid: 'CA1',
        recordUpload: null,
        alreadyFetchedSubscription: true,
        subscriptionFetchFailed: true,
      })
    ),
    { kind: 'land', reason: 'reached_record' }
  );
});

// ── Order of the gates ───────────────────────────────────────────────────

test('the gates keep their order under every combination that matters', () => {
  // Each row: what is wrong, and the reason that must win.
  const rows: [Partial<LandingInput>, string][] = [
    [{ connected: false, autoLandEnabled: false }, 'no_call'],
    [{ alreadyLanded: true, appActive: false }, 'already_landed'],
    [{ autoLandEnabled: false, appActive: false }, 'flag_off'],
    [{ appActive: false, keypadUp: true }, 'not_active'],
    [{ navReady: false, keypadUp: true }, 'nav_not_ready'],
    [{ keypadUp: true, role: 'listener' }, 'keypad_open'],
    [{ role: 'listener', dtmfSentSid: null }, 'awaiting_digit'],
    [{ role: 'listener', dtmfSentSid: 'CA1' }, 'not_creator'],
  ];
  for (const [over, reason] of rows) {
    assert.equal(decideLanding(base(over)).reason, reason, JSON.stringify(over));
  }
});
