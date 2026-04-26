import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';

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
