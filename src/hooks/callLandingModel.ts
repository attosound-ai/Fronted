/**
 * Where an incoming call lands, as one pure decision.
 *
 * The rule the client asked for on Sep 23 2026 has not changed: an inbound
 * call lands on the feed with the glass keypad over it, and only the
 * creator's digit opens the recorder. What changed on Sep 25, after he said
 * "nothing is smooth and seamless about the transition from one screen to
 * another", is that the decision now lives here, alone, with every case
 * written down as a test instead of being discovered on a live call.
 *
 * The hook keeps the side effects: navigation, telemetry, the subscription
 * fetch. This file only answers the question.
 */

/** Everything the decision depends on, in one place. */
export interface LandingInput {
  /** connected or reconnecting; anything else means there is no call. */
  connected: boolean;
  callSid: string | null;
  direction: 'inbound' | 'outbound' | null;
  /** The call the creator already accepted with a digit. */
  dtmfSentSid: string | null;
  /** Auto opening the recorder is flag gated (memory). */
  autoLandEnabled: boolean;
  appActive: boolean;
  navReady: boolean;
  /** The pad is a modal route over everything; nothing moves while it is up. */
  keypadUp: boolean;
  pathname: string;
  role: string | null | undefined;
  /** true, false, or null while the subscription is still resolving. */
  recordUpload: boolean | null;
  /** A transient failure must not strand a creator on the feed forever. */
  subscriptionFetchFailed: boolean;
  /** This call already asked for the subscription once. */
  alreadyFetchedSubscription: boolean;
  /** This call already sent a stray screen home once. */
  alreadySentHome: boolean;
  /** This call already landed. */
  alreadyLanded: boolean;
}

export type LandingAction =
  /** Nothing to do, and nothing will change without new input. */
  | { kind: 'idle'; reason: string }
  /** Wait for something that is expected to arrive. */
  | { kind: 'wait'; reason: string }
  /** Bring a stray screen back to the feed, once per call. */
  | { kind: 'home'; reason: string }
  /** Ask for the subscription, then wait for it. */
  | { kind: 'fetchSubscription'; reason: string }
  /** Open the recorder. */
  | { kind: 'land'; reason: string };

/** Screens that are already a valid home for a live call. */
function isCallOwnedScreen(pathname: string): boolean {
  return pathname === '/call' || pathname.includes('/recording');
}

/**
 * The gates, in the order they have to be asked. Order matters: the keypad
 * outranks everything below it because navigating while the pad is up tore it
 * off the screen before the creator could press a digit, and the call died
 * unanswered (Sep 22 2026).
 */
export function decideLanding(input: LandingInput): LandingAction {
  if (!input.connected || !input.callSid) return { kind: 'idle', reason: 'no_call' };
  if (input.alreadyLanded) return { kind: 'idle', reason: 'already_landed' };
  if (!input.autoLandEnabled) return { kind: 'idle', reason: 'flag_off' };
  if (!input.appActive) return { kind: 'wait', reason: 'not_active' };
  if (!input.navReady) return { kind: 'wait', reason: 'nav_not_ready' };
  if (input.keypadUp) return { kind: 'wait', reason: 'keypad_open' };

  // Inbound: the recorder waits for the creator's digit. Until then the only
  // move allowed is bringing a stray screen back to the feed, once.
  if (input.direction === 'inbound' && input.dtmfSentSid !== input.callSid) {
    if (
      !input.alreadySentHome &&
      !isCallOwnedScreen(input.pathname) &&
      input.pathname !== '/'
    ) {
      return { kind: 'home', reason: 'stray_screen' };
    }
    return { kind: 'wait', reason: 'awaiting_digit' };
  }

  if (isCallOwnedScreen(input.pathname)) {
    return { kind: 'idle', reason: 'already_on_target' };
  }
  if (input.role !== 'creator') return { kind: 'idle', reason: 'not_creator' };
  if (input.recordUpload === false) return { kind: 'idle', reason: 'no_entitlement' };
  if (input.recordUpload === null) {
    if (!input.alreadyFetchedSubscription) {
      return { kind: 'fetchSubscription', reason: 'subscription_unknown' };
    }
    // Asked already. Still loading means wait; a failed fetch must not strand
    // the creator, so the recorder opens anyway.
    if (!input.subscriptionFetchFailed) {
      return { kind: 'wait', reason: 'sub_unresolved' };
    }
  }
  return { kind: 'land', reason: 'reached_record' };
}
