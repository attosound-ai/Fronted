import React, { useEffect } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useCallStore } from '@/stores/callStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import {
  acceptIncomingCall,
  rejectIncomingCall,
  hangUpCall,
} from '@/hooks/useTwilioVoice';
import { IncomingCallScreen } from '@/components/call/IncomingCallScreen';
import { OutgoingCallScreen } from '@/components/call/OutgoingCallScreen';

function dismiss() {
  if (router.canDismiss()) {
    router.dismiss();
  } else {
    router.replace('/');
  }
}

export default function CallScreen() {
  const activeCall = useCallStore((s) => s.activeCall);

  // When call connects: non-pro users go straight to recording,
  // pro users dismiss to tabs (where CallBanner lets them pick a project).
  useEffect(() => {
    if (activeCall?.state === 'ringing' || activeCall?.state === 'ringing-outgoing')
      return;

    if (activeCall?.state === 'connected') {
      const canRecord = useSubscriptionStore.getState().hasEntitlement('record_upload');
      if (canRecord) {
        const hasPro = useSubscriptionStore.getState().hasEntitlement('advanced_production');
        if (!hasPro) {
          // record plan: dismiss call modal, then navigate to recording inside tabs
          if (router.canDismiss()) router.dismiss();
          setTimeout(() => router.push('/(tabs)/recording'), 100);
          return;
        }
      }
      // connect_free: no recording, just dismiss to tabs
      // record_pro: dismiss to tabs, CallBanner lets them pick a project
    }

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

  if (activeCall?.state === 'ringing') {
    return (
      <IncomingCallScreen
        fromNumber={activeCall.fromNumber}
        onAccept={acceptIncomingCall}
        onReject={rejectIncomingCall}
      />
    );
  }

  if (activeCall?.state === 'ringing-outgoing') {
    return (
      <OutgoingCallScreen
        recipientName={activeCall.recipientName || activeCall.recipientId || 'Unknown'}
        onCancel={hangUpCall}
      />
    );
  }

  // Tappable black screen so user can escape if dismiss fails
  return (
    <Pressable style={styles.container} onPress={dismiss}>
      <View />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
});
