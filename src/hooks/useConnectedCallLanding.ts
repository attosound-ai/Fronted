import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { router, usePathname, useRootNavigationState } from 'expo-router';

import { useCallStore } from '@/stores/callStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useAuthStore } from '@/stores/authStore';
import { analytics, ANALYTICS_EVENTS, useFeatureFlag } from '@/lib/analytics';
import { isOnCallScreen, isCallConnected } from '@/hooks/useInCallChrome';

/**
 * Gates auto-opening the Record Pro editor on a connected call. DEFAULT OFF
 * (David, Jul 22): auto-loading the editor on every call exploded memory
 * 200MB->1.4GB and iOS jetsam-killed the app mid-call → dropped AND missed calls
 * (the killed app can't receive the next VoIP push). With this off, calls land on
 * a plain call screen and the recorder is opt-in. Re-enable per-cohort via the
 * flag once the editor's in-call memory is reduced.
 */
export const INCALL_EDITOR_AUTOLOAD_FLAG = 'incall_editor_autoload';

/**
 * useConnectedCallLanding — bring the RECORDER to the foreground for an eligible
 * creator whenever a call is active, no matter HOW the call was answered. Mounted
 * once in (tabs)/_layout so it's alive for every entry path.
 *
 * THE hard case (David, Jul 2026): the phone is LOCKED / screen off (or the app
 * was killed), the call is answered from the native CallKit lock-screen UI, and
 * the user then UNLOCKS while still on the call. iOS does not let any app
 * foreground itself — the ONLY sanctioned trigger is marking the call as a
 * "video" call, which makes iOS launch us into the foreground on unlock (see the
 * hasVideo/supportsVideo patch in TwilioVoiceReactNative+CallKit.m). This hook is
 * the JS half: the instant we ARE foregrounded during an active call, land the
 * eligible user on the recorder — cleanly, with no feed flash.
 *
 * Fires on BOTH triggers so every path is covered:
 *   1. call transitions to connected (answered in-app / warm)
 *   2. app returns to the foreground while a call is connected (the unlock case)
 *
 * Eligibility (David's scope: "creadores con subscripción activa"):
 *   role === 'creator'  AND  record_upload entitlement === true.
 * On a cold launch the subscription may not be resolved yet (null): we kick a
 * fetch and DON'T navigate until it confirms true — so a free/without-sub creator
 * is never forced onto the recorder. Non-creators are simply left where they are.
 *
 * Navigates at most once per callSid; skips when already on /call (it runs its
 * own hand-off) or already on the recorder; gated on the root navigator being
 * ready so a cold-launch foreground doesn't fire into an unmounted router.
 */
export function useConnectedCallLanding(): void {
  const callState = useCallStore((s) => s.activeCall?.state);
  const callSid = useCallStore((s) => s.activeCall?.callSid);
  const role = useAuthStore((s) => s.user?.role);
  // Reactive: re-runs when the subscription resolves (cold-launch null → true).
  const recordUpload = useSubscriptionStore((s) => s.entitlementState('record_upload'));
  // Reactive: so a FAILED fetch (transient network on cold launch) re-triggers the
  // effect — otherwise a creator whose fetch errored stays null forever and never
  // lands on the recorder (nothing the selector reads would change again).
  const lastFetchFailed = useSubscriptionStore((s) => s.lastFetchFailed);
  const pathname = usePathname();
  const navReady = useRootNavigationState()?.key != null;

  // Default OFF → no auto-open of the memory-heavy editor (see flag doc above).
  const autoLandEnabled = useFeatureFlag(INCALL_EDITOR_AUTOLOAD_FLAG) === true;

  const landedForSid = useRef<string | null>(null);
  const fetchedForSid = useRef<string | null>(null);
  // Emit ONE landing-skip row per (call, reason) so a creator who lands on the
  // feed instead of the recorder self-reports WHICH gate stopped it, instead of
  // us guessing (Anthony, Aug 11: "opens to the feed, not the recording suite").
  const loggedSkipRef = useRef<string | null>(null);
  const logSkip = (sid: string, reason: string) => {
    const key = `${sid}:${reason}`;
    if (loggedSkipRef.current === key) return;
    loggedSkipRef.current = key;
    analytics.capture(ANALYTICS_EVENTS.CALL.LANDING_SKIPPED, { call_sid: sid, reason });
  };

  // App foreground/active is not a reactive store — bump state on transitions so
  // the effect re-evaluates the instant the user unlocks back into the app.
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!isCallConnected(callState) || !callSid) return;
    // Relief: without the flag we never auto-open the editor (OOM mitigation).
    if (!autoLandEnabled) return;
    if (!appActive || !navReady) return; // only act once we're actually foregrounded
    if (landedForSid.current === callSid) return;
    // /call owns its own hand-off; the recorder means we already landed.
    if (isOnCallScreen(pathname) || pathname.includes('/recording')) {
      landedForSid.current = callSid;
      return;
    }
    if (role !== 'creator') {
      logSkip(callSid, 'not_creator'); // recorder is a creator surface
      return;
    }

    // "active subscription": true → go; false → never; null → resolve it first.
    if (recordUpload === false) {
      logSkip(callSid, 'no_entitlement');
      return;
    }
    if (recordUpload === null) {
      if (fetchedForSid.current !== callSid) {
        fetchedForSid.current = callSid;
        void useSubscriptionStore.getState().fetchSubscription();
        return;
      }
      // Already fetched for this call. Still loading → wait for the reactive
      // re-run. But if the fetch FAILED (transient network on cold launch), don't
      // strand the creator forever — land them optimistically; the recorder
      // tolerates an unresolved sub, and a creator answering a call should reach
      // it rather than be stuck on the feed because a request timed out.
      if (!lastFetchFailed) {
        logSkip(callSid, 'sub_unresolved');
        return;
      }
    }

    // recordUpload === true, OR a creator whose sub fetch failed transiently.
    landedForSid.current = callSid;
    analytics.capture(ANALYTICS_EVENTS.CALL.NAV_TO_RECORD, {
      outcome: 'reached_record',
      trigger: 'global_landing',
      entitlement_record_upload: recordUpload,
      fetch_failed: recordUpload === null,
      app_state: AppState.currentState,
    });
    router.replace('/(tabs)/recording');
  }, [
    callState,
    callSid,
    role,
    recordUpload,
    lastFetchFailed,
    appActive,
    navReady,
    pathname,
    autoLandEnabled,
  ]);
}
