import { Alert, Linking } from 'react-native';
import { AudioModule } from 'expo-audio';

import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import i18n from '@/lib/i18n';
import { mmkvStorage } from '@/lib/storage/mmkv';

/**
 * Tell the user when iOS blocks ATTO's microphone (Oct 10 2026, bj203).
 *
 * That iPhone had the permission denied since Sep 11 with can_ask_again false:
 * iOS never asks again, calls connect, and the far party hears nothing while the
 * user sees no sign of why (he pressed mute and speaker over and over). The app
 * knew (call_mic_permission_status said denied 41 times) and said nothing.
 *
 * Now: at every connected call, and at sign in at most once a day, a blocked
 * microphone gets an alert with a button straight to ATTO's page in Settings.
 */

const LOGIN_WARNED_KEY = 'atto_mic_blocked_warned_at';
const LOGIN_EVERY_MS = 24 * 60 * 60 * 1000;
const warnedCalls = new Set<string>();

function showBlockedAlert(body: string, phase: string): void {
  Alert.alert(i18n.t('calls:micBlocked.title'), body, [
    {
      text: i18n.t('calls:micBlocked.later'),
      style: 'cancel',
      onPress: () =>
        analytics.capture(ANALYTICS_EVENTS.CALL.MIC_BLOCKED_ALERT, {
          phase,
          action: 'later',
        }),
    },
    {
      text: i18n.t('calls:micBlocked.open'),
      onPress: () => {
        analytics.capture(ANALYTICS_EVENTS.CALL.MIC_BLOCKED_ALERT, {
          phase,
          action: 'open_settings',
        });
        void Linking.openSettings();
      },
    },
  ]);
  analytics.capture(ANALYTICS_EVENTS.CALL.MIC_BLOCKED_ALERT, { phase, action: 'shown' });
}

/** Once per call, when it connects. Resolves the permission status it read. */
export async function warnIfMicBlockedForCall(
  callSid: string | null
): Promise<string | null> {
  try {
    const p = await AudioModule.getRecordingPermissionsAsync();
    analytics.capture(ANALYTICS_EVENTS.CALL.MIC_PERMISSION_STATUS, {
      phase: 'call_connected',
      status: p.status,
      granted: p.granted,
      can_ask_again: p.canAskAgain,
      call_sid: callSid,
    });
    const key = callSid ?? 'unknown';
    if (!p.granted && !warnedCalls.has(key)) {
      warnedCalls.add(key);
      showBlockedAlert(i18n.t('calls:micBlocked.callBody'), 'call_connected');
    }
    return p.status;
  } catch {
    return null;
  }
}

/** At sign in, when iOS will not ask again: at most once a day. */
export function warnIfMicBlockedAtLogin(granted: boolean, canAskAgain: boolean): void {
  if (granted || canAskAgain) return;
  const last = Number(mmkvStorage.getString(LOGIN_WARNED_KEY) ?? 0);
  if (Number.isFinite(last) && Date.now() - last < LOGIN_EVERY_MS) return;
  mmkvStorage.setString(LOGIN_WARNED_KEY, String(Date.now()));
  showBlockedAlert(i18n.t('calls:micBlocked.loginBody'), 'login');
}

/** The permission status for telemetry, without any alert. */
export async function micPermissionStatus(): Promise<string | null> {
  try {
    return (await AudioModule.getRecordingPermissionsAsync()).status;
  } catch {
    return null;
  }
}
