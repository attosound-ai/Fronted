import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { API_CONFIG } from '@/constants/config';

// Must be called at module level — tells the OS how to handle
// notifications when the app is in the foreground.
// Multi-account: show the alert only if the push is for a DIFFERENT account
// than the one currently active (so the user knows about activity on other accounts).
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const accountId = notification.request.content.data?.account_id as string | undefined;

    // Dynamically import to avoid circular deps
    const { useAuthStore } = await import('@/stores/authStore');
    const currentUserId = String(useAuthStore.getState().user?.id ?? '');

    // If push is for a different account, show the system alert
    const isOtherAccount = accountId && accountId !== currentUserId;

    const showSystemUi = !!isOtherAccount;
    return {
      shouldShowBanner: showSystemUi,
      shouldShowList: showSystemUi,
      shouldPlaySound: showSystemUi,
      shouldSetBadge: true,
    };
  },
});

/**
 * Request permission and get Expo push token.
 * Returns null on simulator or if permission is denied.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  // Android: create default channel before getting token
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  return tokenData.data;
}

/** Send the Expo push token to the backend for the current user. */
export async function sendTokenToBackend(token: string): Promise<void> {
  const deviceId = Constants.deviceName || 'unknown';
  const platform = Platform.OS;
  await apiClient.post(API_ENDPOINTS.USERS.PUSH_TOKEN, {
    token,
    deviceId,
    platform,
  });
}

/**
 * Register the device's push token for a specific linked account, using
 * that account's access token directly instead of the axios interceptor
 * (which always uses the active session's JWT).
 *
 * Without this, only the active account at registration time gets a
 * `push_tokens` row — linked accounts (e.g., managed creator under a
 * representative) stay silent until the user explicitly switches to them.
 *
 * Backend `UpsertPushToken` is idempotent on `(user_id, token)` so calling
 * this repeatedly with the same args is safe.
 */
export async function sendTokenToBackendForAccount(
  expoToken: string,
  accessToken: string
): Promise<void> {
  const res = await postPushToken(expoToken, accessToken);
  if (!res.ok) {
    throw new Error(`push token registration failed: HTTP ${res.status}`);
  }
}

/**
 * Register the device for one linked account, refreshing that account's
 * tokens when they have gone stale.
 *
 * The stored access token of a linked account is only rotated when the user
 * switches to it, so on a cold start it is usually expired and the bare POST
 * answered 401 on every launch (the "[push] register failed" warning). The
 * ACTIVE account goes through apiClient, whose interceptor owns that
 * session's refresh; any other account is refreshed here with its own
 * refresh token and the new pair is persisted, since nobody else holds it.
 */
export async function registerPushForAccount(
  expoToken: string,
  account: {
    user: { id: number };
    tokens: { accessToken: string; refreshToken: string };
  },
  isActive: boolean
): Promise<void> {
  const deviceId = Constants.deviceName || 'unknown';
  const platform = Platform.OS;

  if (isActive) {
    await apiClient.post(API_ENDPOINTS.USERS.PUSH_TOKEN, {
      token: expoToken,
      deviceId,
      platform,
    });
    return;
  }

  let res = await postPushToken(expoToken, account.tokens.accessToken);
  if (res.status === 401) {
    const { authService } = await import('@/lib/api/authService');
    const { setAccountTokens } = await import('@/lib/auth/storage');
    const { useAccountStore } = await import('@/stores/accountStore');
    const fresh = await authService.refreshToken(account.tokens.refreshToken);
    await setAccountTokens(account.user.id, fresh);
    useAccountStore.setState((s) => ({
      accounts: s.accounts.map((a) =>
        a.user.id === account.user.id ? { ...a, tokens: fresh } : a
      ),
    }));
    res = await postPushToken(expoToken, fresh.accessToken);
  }
  if (!res.ok) {
    throw new Error(`push token registration failed: HTTP ${res.status}`);
  }
}

async function postPushToken(expoToken: string, accessToken: string): Promise<Response> {
  const deviceId = Constants.deviceName || 'unknown';
  const platform = Platform.OS;
  const base = API_CONFIG.BASE_URL.replace(/\/$/, '');
  const url = `${base}${API_ENDPOINTS.USERS.PUSH_TOKEN}`;

  return fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ token: expoToken, deviceId, platform }),
  });
}

/** Remove the push token for the current user only (not other accounts). */
export async function removeTokenFromBackend(token: string): Promise<void> {
  await apiClient.delete(API_ENDPOINTS.USERS.PUSH_TOKEN, {
    data: { token },
  });
}

/** Navigate to the deep link URL embedded in a push notification. */
export function handleNotificationResponse(
  response: Notifications.NotificationResponse
): void {
  const url = response.notification.request.content.data?.url as string | undefined;
  if (url) {
    // Small delay on Android cold start to ensure navigation is mounted
    setTimeout(() => router.push(url as any), 100);
  }
}
