import React from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useCallStore } from '@/stores/callStore';
import { useMountEffect } from '@/hooks';
import { ActiveCallScreen } from '@/components/call/ActiveCallScreen';

export default function RecordingScreen() {
  const { t } = useTranslation('calls');

  useMountEffect(() => {
    let hadCall = !!useCallStore.getState().activeCall;

    const unsubscribe = useCallStore.subscribe((state, prev) => {
      if (state.activeCall) hadCall = true;
      if (hadCall && prev.activeCall && !state.activeCall) {
        if (router.canDismiss()) router.dismiss();
      }
    });

    return unsubscribe;
  });

  const handleBack = () => {
    if (router.canDismiss()) {
      router.dismiss();
    } else {
      router.replace('/(tabs)');
    }
  };

  return <ActiveCallScreen onBack={handleBack} />;
}
