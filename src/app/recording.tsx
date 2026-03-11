import React, { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useCallStore } from '@/stores/callStore';
import { ActiveCallScreen } from '@/components/call/ActiveCallScreen';

export default function RecordingScreen() {
  const { t } = useTranslation('calls');
  const activeCall = useCallStore((s) => s.activeCall);
  const wasConnected = useRef(false);

  // Track if we ever had an active call on this screen
  useEffect(() => {
    if (activeCall) {
      wasConnected.current = true;
    }
  }, [activeCall]);

  // Dismiss modal only when call actually ends (not on initial mount)
  useEffect(() => {
    if (!wasConnected.current) return;
    if (activeCall) return;

    const timeout = setTimeout(() => {
      if (router.canDismiss()) {
        router.dismiss();
      }
    }, 0);
    return () => clearTimeout(timeout);
  }, [activeCall]);

  const handleBack = () => {
    if (router.canDismiss()) {
      router.dismiss();
    } else {
      router.replace('/(tabs)');
    }
  };

  return <ActiveCallScreen onBack={handleBack} />;
}
