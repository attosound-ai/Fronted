import React from 'react';
import { router } from 'expo-router';
import { useCallStore } from '@/stores/callStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useMountEffect } from '@/hooks';
import { ActiveCallScreen } from '@/components/call/ActiveCallScreen';
import { SimpleRecordingScreen } from '@/components/call/SimpleRecordingScreen';

export default function RecordingScreen() {
  const canRecord = useSubscriptionStore((s) => s.hasEntitlement('record_upload'));
  const hasAdvancedProduction = useSubscriptionStore((s) =>
    s.hasEntitlement('advanced_production'),
  );

  // No paid subscription → redirect away
  useMountEffect(() => {
    if (!canRecord) {
      router.replace('/(tabs)');
    }
  });

  useMountEffect(() => {
    let hadCall = !!useCallStore.getState().activeCall;

    const unsubscribe = useCallStore.subscribe((state, prev) => {
      if (state.activeCall) hadCall = true;
      if (hadCall && prev.activeCall && !state.activeCall) {
        router.replace('/(tabs)');
      }
    });

    return unsubscribe;
  });

  const handleBack = () => {
    router.replace('/(tabs)');
  };

  if (hasAdvancedProduction) {
    return <ActiveCallScreen onBack={handleBack} />;
  }

  return <SimpleRecordingScreen onBack={handleBack} />;
}
