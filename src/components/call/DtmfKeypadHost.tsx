import { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { DtmfKeypad } from './DtmfKeypad';
import { useCallStore } from '@/stores/callStore';
import { sendCallDigit } from '@/hooks/useTwilioVoice';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { SPACING } from '@/constants/theme';

/**
 * Global host for the in-call DTMF keypad. Mounted once at the root so a
 * single sheet serves every call surface (InCallTopBar, ActiveCallScreen,
 * SimpleRecordingScreen) — no per-screen sheet state to duplicate.
 *
 * Two responsibilities, both presentation-level:
 *  1. Render the keypad sheet driven by `callStore.keypadVisible`, forwarding
 *     digits to the telephony adapter (`sendCallDigit`).
 *  2. Auto-open the keypad once when an INBOUND call connects — almost every
 *     inbound call on ATTO is a Securus inmate call that needs "press 1", so
 *     the keypad should be front-and-center the moment the call connects. It
 *     never auto-SENDS a digit; the user still taps deliberately.
 */
export function DtmfKeypadHost() {
  const { t } = useTranslation('calls');
  const keypadVisible = useCallStore((s) => s.keypadVisible);
  const showKeypad = useCallStore((s) => s.showKeypad);
  const hideKeypad = useCallStore((s) => s.hideKeypad);

  const callSid = useCallStore((s) => s.activeCall?.callSid);
  const state = useCallStore((s) => s.activeCall?.state);
  const direction = useCallStore((s) => s.activeCall?.direction);

  const isConnected = state === 'connected';

  // Auto-open once per call: remember the SID we've already opened for so the
  // sheet doesn't pop back up if the user dismissed it mid-call.
  const autoOpenedSidRef = useRef<string | null>(null);
  useEffect(() => {
    if (!callSid) {
      autoOpenedSidRef.current = null;
      return;
    }
    if (isConnected && direction === 'inbound' && autoOpenedSidRef.current !== callSid) {
      autoOpenedSidRef.current = callSid;
      showKeypad();
      analytics.capture(ANALYTICS_EVENTS.CALL.KEYPAD_AUTO_OPENED, {
        call_sid: callSid,
        direction,
      });
    }
  }, [callSid, isConnected, direction, showKeypad]);

  return (
    <BottomSheet
      visible={keypadVisible}
      onClose={hideKeypad}
      title={t('active.keypadTitle', 'Keypad')}
    >
      <View style={styles.body}>
        <DtmfKeypad
          onPressDigit={(d) => {
            void sendCallDigit(d);
          }}
          onKeyTap={(digit, meta) =>
            analytics.capture(ANALYTICS_EVENTS.CALL.DTMF_KEYPRESS, {
              digit,
              // dropped=true → the tap registered but went nowhere because the
              // keypad was disabled (call not yet connected). The Securus blind spot.
              dropped: meta.disabled,
              call_state: state ?? null,
              is_connected: isConnected,
              call_sid: callSid ?? null,
              direction: direction ?? null,
              keypad_visible: keypadVisible,
            })
          }
          disabled={!isConnected}
        />
      </View>
    </BottomSheet>
  );
}

/** Open the keypad sheet from a control-bar button. */
export function openKeypad() {
  useCallStore.getState().showKeypad();
  analytics.capture(ANALYTICS_EVENTS.CALL.KEYPAD_OPENED);
}

const styles = StyleSheet.create({
  body: {
    paddingBottom: SPACING.md,
  },
});
