/**
 * Has this inbound call already been accepted?
 *
 * An inbound call on ATTO is a facility call that needs a digit ("press 1").
 * Until Sep 30 2026 the app only knew about a digit pressed on ITS keypad.
 * The client answered from the lock screen, pressed the digit on the system
 * call screen, talked for fifteen minutes, and the app spent all of it
 * waiting for a digit: the recorder never opened and the keypad came up over
 * a call that was long since accepted.
 *
 * Three ways to know, any one is enough:
 *  - the app's keypad sent a digit on this call (callStore.dtmfSentSid),
 *  - the native side saw a digit go out on this call, from the system keypad
 *    or from the app before a relaunch (NSUserDefaults atto_dtmf_call_sid),
 *  - the call has simply lasted: a facility drops an unaccepted call well
 *    before two minutes, so one still connected after that was accepted.
 *
 * The elapsed rule is only consulted when something else re-evaluates the
 * landing (the app coming to the foreground, the keypad closing). No timer
 * fires at the two minute mark on purpose: moving someone to the recorder
 * while they are doing something else on a call that needs no digit would
 * be the app acting on its own.
 *
 * Pure on purpose: every case is a test, none is found on a live call.
 */

/** A facility hangs up an unaccepted call long before this. */
export const ASSUME_ACCEPTED_AFTER_MS = 120_000;

export interface AcceptanceInput {
  callSid: string | null | undefined;
  direction: 'inbound' | 'outbound' | null | undefined;
  /** The call the app's own keypad accepted. */
  dtmfSentSid: string | null | undefined;
  /** The call the native side saw a digit on. */
  nativeDtmfSid: string | null | undefined;
  /** How long the call has been connected, or null when unknown. */
  connectedForMs: number | null;
}

export type AcceptedVia = 'outbound' | 'app_keypad' | 'native_digit' | 'elapsed';

/** How we know the call is accepted, or null when it still needs its digit. */
export function acceptedVia(input: AcceptanceInput): AcceptedVia | null {
  if (!input.callSid) return null;
  if (input.direction === 'outbound') return 'outbound';
  if (input.dtmfSentSid === input.callSid) return 'app_keypad';
  if (input.nativeDtmfSid === input.callSid) return 'native_digit';
  if (input.connectedForMs !== null && input.connectedForMs >= ASSUME_ACCEPTED_AFTER_MS) {
    return 'elapsed';
  }
  return null;
}
