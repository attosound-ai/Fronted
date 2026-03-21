import React, { useEffect } from 'react';
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

  // Dismiss when call is no longer ringing. Polls every 100ms to handle
  // cold-start race where the nav stack isn't ready immediately.
  useEffect(() => {
    if (activeCall?.state === 'ringing') return;

    const id = setInterval(() => {
      if (router.canDismiss()) {
        clearInterval(id);
        router.dismiss();
      }
    }, 100);

    const safety = setTimeout(() => {
      clearInterval(id);
      if (!router.canDismiss()) router.replace('/');
    }, 2000);

    return () => {
      clearInterval(id);
      clearTimeout(safety);
    };
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
