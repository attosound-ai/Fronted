import React, { useEffect } from 'react';
import { router } from 'expo-router';
import { useCallStore } from '@/stores/callStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useMountEffect } from '@/hooks';
import { ActiveCallScreen } from '@/components/call/ActiveCallScreen';
import { SimpleRecordingScreen } from '@/components/call/SimpleRecordingScreen';

export default function RecordingScreen() {
  const recordState = useSubscriptionStore((s) => s.entitlementState('record_upload'));
  const hasAdvancedProduction = useSubscriptionStore((s) =>
    s.hasEntitlement('advanced_production'),
  );

  // Redirect away ONLY once we're certain the user is NOT record-capable
  // (entitlementState === false). While it's still unknown (null — store not
  // hydrated / mid-fetch on a cold-launch or background CallKit answer) we STAY,
  // matching the /call hand-off that optimistically lands the rep here so an
  // answered-from-outside-the-app call always reaches record. This effect re-runs
  // as the entitlement resolves, so a genuinely-free user is bounced the instant
  // their plan is known — no premature bounce on the transient-null window.
  useEffect(() => {
    if (recordState === false) {
      router.replace('/(tabs)');
    }
  }, [recordState]);

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
