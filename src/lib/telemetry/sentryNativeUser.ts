import { Platform, Settings } from 'react-native';

/**
 * Mirror the Sentry user identity into native NSUserDefaults so the NATIVE Sentry
 * SDK — armed in the withSentryNativeInit config plugin BEFORE the JS bundle runs
 * — can attribute a pre-JS crash to a user.
 *
 * WHY THIS EXISTS: the crashes we most need attributed are the ones that happen
 * in the launch window before React Native is up — the PushKit / CallKit
 * cold-launch path (Sentry REACT-NATIVE-4H). JS `Sentry.setUser` runs far too
 * late for those: by the time the JS bundle evaluates, the crash already fired
 * and landed in Sentry with NO user. So on every successful launch we stamp the
 * current user's id/username into NSUserDefaults; the native init reads them back
 * on the NEXT launch and sets the Sentry scope before anything can crash.
 *
 * iOS-only: only the iOS native init reads these keys. `Settings` is the RN
 * bridge to `[NSUserDefaults standardUserDefaults]`, the same store the native
 * plugin reads. A null user (logout) clears the keys so a crash after logout is
 * not misattributed to the last signed-in user.
 */
export function persistSentryUserForNative(
  userId: string | null,
  username?: string | null
): void {
  if (Platform.OS !== 'ios') return;
  try {
    Settings.set({
      atto_sentry_user_id: userId ?? '',
      atto_sentry_username: username ?? '',
    });
  } catch {
    // Best-effort attribution; never let it affect auth.
  }
}
