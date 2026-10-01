import { Settings } from 'react-native';

import { useCallStore } from '@/stores/callStore';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { acceptedVia, type AcceptedVia } from './callAcceptance';

/** The call the native side saw a digit on (written by the Twilio patch). */
function nativeDtmfSid(): string | null {
  try {
    const value = Settings.get('atto_dtmf_call_sid');
    return typeof value === 'string' && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

const reported = new Set<string>();

/**
 * Whether the live call is already accepted, checked NOW (not reactive: the
 * native mark and the clock do not re-render anything, so callers ask on
 * their own ticks). When the answer comes from somewhere other than the app
 * keypad, the store is told, so everything downstream (the recorder landing,
 * the keypad) sees one accepted call, and it is reported once per call.
 */
export function syncCallAcceptance(): AcceptedVia | null {
  const { activeCall, dtmfSentSid, markDtmfSent } = useCallStore.getState();
  const callSid = activeCall?.callSid ?? null;
  if (!callSid) return null;
  const connectedForMs = activeCall?.connectedAt
    ? Date.now() - new Date(activeCall.connectedAt).getTime()
    : null;
  const direction =
    activeCall?.direction === 'inbound' || activeCall?.direction === 'outbound'
      ? activeCall.direction
      : null;
  const via = acceptedVia({
    callSid,
    direction,
    dtmfSentSid,
    nativeDtmfSid: nativeDtmfSid(),
    connectedForMs,
  });
  if ((via === 'native_digit' || via === 'elapsed') && dtmfSentSid !== callSid) {
    markDtmfSent(callSid);
    // The digit went out on the system keypad: the app's pad, if it was left
    // open, now only covers the call and holds the recorder back.
    if (via === 'native_digit' && useCallStore.getState().keypadVisible) {
      useCallStore.getState().hideKeypad();
    }
    if (!reported.has(callSid)) {
      reported.add(callSid);
      analytics.capture(ANALYTICS_EVENTS.CALL.ACCEPT_DETECTED, {
        call_sid: callSid,
        via,
        connected_for_ms: connectedForMs,
      });
    }
  }
  return via;
}
