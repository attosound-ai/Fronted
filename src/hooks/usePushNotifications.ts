import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '@/stores/authStore';
import { useAccountStore } from '@/stores/accountStore';
import {
  registerForPushNotifications,
  sendTokenToBackendForAccount,
  handleNotificationResponse,
} from '@/lib/pushNotifications';

/**
 * Registers the device's Expo push token for EVERY account linked on this
 * device — not just the currently-active session.
 *
 * Without this, a representative who creates a managed creator in the
 * same wizard would leave the creator with no `push_tokens` row until
 * the user manually long-press-switched to it. Messages, follows and
 * other regular pushes targeted at the creator silently dropped.
 *
 * Re-runs only when the linked-account membership changes (login, add,
 * remove, logout) — `accountIdsKey` is a stable sorted-joined string so
 * identical sets never trigger spurious re-registrations. Backend upsert
 * on `(user_id, token)` makes individual calls idempotent regardless.
 */
export function usePushNotifications() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  // Sorted+joined IDs: stable across re-renders, mutates only when the
  // set of linked accounts actually changes.
  const accountIdsKey = useAccountStore((s) =>
    s.accounts
      .map((a) => a.user.id)
      .sort((a, b) => a - b)
      .join(',')
  );
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    const accounts = useAccountStore.getState().accounts;
    if (accounts.length === 0) return;

    registerForPushNotifications().then((expoToken) => {
      if (!expoToken) return;
      tokenRef.current = expoToken;
      // Register the same device token for every linked account so each
      // `(user_id, token)` row exists in `push_tokens`. Per-account
      // failures are non-fatal: one revoked access token can't sink the
      // others.
      for (const account of accounts) {
        sendTokenToBackendForAccount(expoToken, account.tokens.accessToken).catch((err) =>
          console.warn(`[push] register failed for user=${account.user.id}:`, err)
        );
      }
    });
  }, [isAuthenticated, accountIdsKey]);

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
