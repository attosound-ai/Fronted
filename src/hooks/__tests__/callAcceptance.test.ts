import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  acceptedVia,
  ASSUME_ACCEPTED_AFTER_MS,
  type AcceptanceInput,
} from '../callAcceptance';

function base(over: Partial<AcceptanceInput> = {}): AcceptanceInput {
  return {
    callSid: 'CA1',
    direction: 'inbound',
    dtmfSentSid: null,
    nativeDtmfSid: null,
    connectedForMs: 5_000,
    ...over,
  };
}

test('a fresh inbound call still needs its digit', () => {
  assert.equal(acceptedVia(base()), null);
});

test('no call is never accepted', () => {
  assert.equal(acceptedVia(base({ callSid: null })), null);
});

test('an outbound call needs no digit', () => {
  assert.equal(acceptedVia(base({ direction: 'outbound' })), 'outbound');
});

test('the digit pressed on the app keypad accepts it', () => {
  assert.equal(acceptedVia(base({ dtmfSentSid: 'CA1' })), 'app_keypad');
});

// El caso del cliente del 30 de septiembre de 2026: contestó con el teléfono
// bloqueado y marcó el dígito en la pantalla de llamada de iOS.
test('the digit pressed on the system call screen accepts it', () => {
  assert.equal(acceptedVia(base({ nativeDtmfSid: 'CA1' })), 'native_digit');
});

test('a digit that belongs to ANOTHER call accepts nothing', () => {
  assert.equal(acceptedVia(base({ dtmfSentSid: 'CA0', nativeDtmfSid: 'CA0' })), null);
});

test('a call that has lasted two minutes was accepted, whatever we missed', () => {
  assert.equal(acceptedVia(base({ connectedForMs: ASSUME_ACCEPTED_AFTER_MS - 1 })), null);
  assert.equal(
    acceptedVia(base({ connectedForMs: ASSUME_ACCEPTED_AFTER_MS })),
    'elapsed'
  );
});

test('an unknown duration proves nothing', () => {
  assert.equal(acceptedVia(base({ connectedForMs: null })), null);
});
