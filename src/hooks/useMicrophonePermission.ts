import { useEffect, useRef } from 'react';
import { AudioModule } from 'expo-audio';
import * as Sentry from '@sentry/react-native';

import { useAuthStore } from '@/stores/authStore';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';

/**
 * Requests microphone permission as soon as the user is authenticated, instead
 * of lazily on the first recording / call.
 *
 * Why: iOS only surfaces the system mic prompt the first time a feature needs
 * the microphone. But a VoIP call answered from the lock screen / Dynamic
 * Island connects through CallKit WITHOUT ever bringing the app forward — so
 * the prompt never appears and the call connects with no mic access. The
 * caller can't hear the user, and they have no idea why (observed live, Bug #1).
 *
 * Asking at login settles the grant before the first call can ever arrive.
 * Fire-once per mount; idempotent (we no-op if already granted or permanently
 * denied). Telemetry captures the grant state so we can measure how many users
 * land in the broken state.
 */
export function useMicrophonePermission() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const asked = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || asked.current) return;
    asked.current = true;

    void (async () => {
      try {
        const current = await AudioModule.getRecordingPermissionsAsync();
        analytics.capture(ANALYTICS_EVENTS.CALL.MIC_PERMISSION_STATUS, {
          phase: 'login',
          status: current.status,
          granted: current.granted,
          can_ask_again: current.canAskAgain,
        });

        // Already granted, or the user permanently denied it (can't re-prompt
        // from here — they'd have to enable it in Settings). Nothing to do.
        if (current.granted || !current.canAskAgain) return;

        const result = await AudioModule.requestRecordingPermissionsAsync();
        analytics.capture(ANALYTICS_EVENTS.CALL.MIC_PERMISSION_REQUESTED, {
          status: result.status,
          granted: result.granted,
        });
      } catch (err) {
        Sentry.captureException(err, {
          tags: { feature: 'mic-permission', step: 'login-request' },
        });
      }
    })();
  }, [isAuthenticated]);
}
