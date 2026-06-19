import React, { useEffect } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import * as Sentry from '@sentry/react-native';
import { useCallStore } from '@/stores/callStore';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import {
  acceptIncomingCall,
  rejectIncomingCall,
  hangUpCall,
} from '@/hooks/useTwilioVoice';
import { IncomingCallScreen } from '@/components/call/IncomingCallScreen';
import { OutgoingCallScreen } from '@/components/call/OutgoingCallScreen';
import { COLORS } from '@/constants/theme';

/**
 * Hand off from the /call fullScreenModal back to the tabs once the call is no
 * longer in an interactive ringing state.
 *
 * We deliberately land on the tabs (NOT push the recorder) because:
 *  - The global `CallBanner` already owns the connected-call UI on the tabs and
 *    lets record-plan users jump into the recorder with one tap. Routing there
 *    is the same proven path free/pro users take.
 *  - The previous `dismiss()` + delayed `push('/(tabs)/recording')` raced the
 *    modal's slide-out animation: the push landed while /call was still
 *    dismissing, stranding the user on a black screen (Bug #2, reproduced).
 *
 * In-app calls have a modal stack → `dismiss()` pops /call back to the tabs.
 * A cold-launch / background answer via CallKit booted straight into /call with
 * no modal to pop → `replace('/(tabs)')`.
 */
function handOff() {
  if (router.canDismiss()) {
    router.dismiss();
  } else {
    router.replace('/(tabs)');
  }
}

export default function CallScreen() {
  const activeCall = useCallStore((s) => s.activeCall);
  const state = activeCall?.state;

  const showingBlackFallback = state !== 'ringing' && state !== 'ringing-outgoing';

  // Hand off whenever we're not on an interactive ringing screen (connected,
  // connecting, reconnecting, or the call cleared).
  useEffect(() => {
    if (state === 'ringing' || state === 'ringing-outgoing') return;

    analytics.capture(ANALYTICS_EVENTS.CALL.SCREEN_CONNECTED_NAV, {
      state: state ?? 'null',
      target: '/(tabs)',
      can_dismiss: router.canDismiss(),
    });

    handOff();
  }, [state]);

  // If the hand-off above somehow failed and we're STILL mounted on the black
  // fallback a couple seconds later, the user is stranded — record it. On a
  // successful hand-off this component unmounts and the timer is cleared, so
  // this only fires for genuine dead-ends.
  useEffect(() => {
    if (!showingBlackFallback) return;
    const t = setTimeout(() => {
      analytics.capture(ANALYTICS_EVENTS.CALL.SCREEN_BLACK_FALLBACK, {
        state: state ?? 'null',
      });
      Sentry.captureMessage('Call screen stranded on black fallback', {
        level: 'warning',
        tags: { feature: 'twilio-voice', step: 'call-screen-handoff' },
      });
    }, 2500);
    return () => clearTimeout(t);
  }, [showingBlackFallback, state]);

  if (state === 'ringing') {
    return (
      <IncomingCallScreen
        fromNumber={activeCall!.fromNumber}
        callerUsername={activeCall!.callerUsername}
        onAccept={acceptIncomingCall}
        onReject={rejectIncomingCall}
      />
    );
  }

  if (state === 'ringing-outgoing') {
    return (
      <OutgoingCallScreen
        recipientName={activeCall!.recipientName || activeCall!.recipientId || 'Unknown'}
        onCancel={hangUpCall}
      />
    );
  }

  // Tappable escape hatch while the hand-off runs (and a last resort if it ever
  // fails — tapping forces us back to the tabs).
  return (
    <Pressable style={styles.container} onPress={handOff}>
      <View />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background.primary,
  },
});
