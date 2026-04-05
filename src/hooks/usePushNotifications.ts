import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '@/stores/authStore';
import {
  registerForPushNotifications,
  sendTokenToBackend,
  handleNotificationResponse,
} from '@/lib/pushNotifications';

/**
 * Registers for push notifications and handles taps.
 *
 * Multi-account: re-registers the token every time the userId changes
 * (login or account switch). Each account gets its own (user_id, token)
 * row in the backend — so pushes arrive for ALL logged-in accounts.
 */
export function usePushNotifications() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userId = useAuthStore((s) => s.user?.id);
  const tokenRef = useRef<string | null>(null);

  // Register token whenever the active user changes
  useEffect(() => {
    if (!isAuthenticated || !userId) return;

    registerForPushNotifications().then((token) => {
      if (token) {
        tokenRef.current = token;
        sendTokenToBackend(token).catch(console.warn);
      }
    });
  }, [isAuthenticated, userId]);

  // Notification tap listeners (only need to set up once)
  useEffect(() => {
    if (!isAuthenticated) return;

    const sub = Notifications.addNotificationResponseReceivedListener(
      handleNotificationResponse
    );

    // Cold start: check if app was opened from a notification tap
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleNotificationResponse(response);
    });

    return () => sub.remove();
  }, [isAuthenticated]);
}
