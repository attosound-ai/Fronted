import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useCallStore } from '@/stores/callStore';
import { acceptIncomingCall, rejectIncomingCall } from '@/hooks/useTwilioVoice';
import { IncomingCallScreen } from '@/components/call/IncomingCallScreen';

function dismiss() {
  if (router.canDismiss()) {
    router.dismiss();
  } else {
    router.replace('/');
  }
}

export default function CallScreen() {
  const activeCall = useCallStore((s) => s.activeCall);
  const dismissAttempts = useRef(0);

  // Dismiss when call is no longer ringing (accepted, rejected, or
  // already connected via CallKit push notification before mount).
  useEffect(() => {
    if (!activeCall || activeCall.state === 'ringing') return;

    // Try dismiss immediately, then retry a few times in case
    // the navigation stack isn't fully ready (cold start).
    dismissAttempts.current = 0;
    const tryDismiss = () => {
      dismissAttempts.current++;
      dismiss();
    };

    const t1 = setTimeout(tryDismiss, 50);
    const t2 = setTimeout(tryDismiss, 500);
    const t3 = setTimeout(tryDismiss, 1500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [activeCall]);

  // Fallback: if the screen stays without an activeCall for 1s, force-dismiss
  useEffect(() => {
    if (activeCall) return;
    const timeout = setTimeout(dismiss, 1000);
    return () => clearTimeout(timeout);
  }, [activeCall]);

  if (activeCall?.state !== 'ringing') {
    // Tappable black screen so user can escape if dismiss fails
    return (
      <Pressable style={styles.container} onPress={dismiss}>
        <View />
      </Pressable>
    );
  }

  return (
    <IncomingCallScreen
      fromNumber={activeCall.fromNumber}
      onAccept={acceptIncomingCall}
      onReject={rejectIncomingCall}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
});
