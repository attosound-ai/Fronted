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

/** Re-evaluate every 1.5s while a connected call hasn't landed, for up to 60s. */
const TICK_MS = 1500;
const MAX_TICKS = 40;

/**
 * useConnectedCallLanding — bring the RECORDER to the foreground for an eligible
 * creator whenever a call is active, no matter HOW the call was answered. Mounted
 * once in (tabs)/_layout so it's alive for every entry path.
 *
 * REWRITTEN (b149) after David's b148 Intento B: the call was adopted while the
 * phone was LOCKED (app background), the landing effect hit a SILENT gate, and
 * after unlock nothing re-evaluated — the creator stayed on the feed with no
 * telemetry saying why. Two structural fixes:
 *
 *  1. A bounded TICKER re-evaluates every 1.5s while a connected call hasn't
 *     landed. Landing no longer depends on the reactive re-render of any
 *     third-party hook (PostHog flag loading, router readiness, AppState timing,
 *     subscription resolution) happening to fire in the right order — any
 *     transient gate clears on a later tick.
 *  2. EVERY gate emits a call_landing_skipped row (deduped per call+reason), so
 *     "it did not land" is always answerable from PostHog, never a guess. A
 *     final gave_up row reports the blocking gate if the 60s budget runs out.
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

  // Reactive flag read, PLUS an imperative read inside the evaluator below: on a
  // background cold launch the reactive hook can be stale/unloaded at mount and
  // its re-render is not guaranteed to arrive — the ticker + imperative read are.
  const autoLandFlagReactive = useFeatureFlag(INCALL_EDITOR_AUTOLOAD_FLAG) === true;

  const landedForSid = useRef<string | null>(null);
  const fetchedForSid = useRef<string | null>(null);
  // One landing-skip row per (call, reason) — a Set, not a last-wins slot, so two
  // alternating reasons can't re-emit each other forever.
  const loggedSkips = useRef<Set<string>>(new Set());
  const logSkip = (sid: string, reason: string, extra?: Record<string, unknown>) => {
    const key = `${sid}:${reason}`;
    if (loggedSkips.current.has(key)) return;
    loggedSkips.current.add(key);
    analytics.capture(ANALYTICS_EVENTS.CALL.LANDING_SKIPPED, {
      call_sid: sid,
      reason,
      app_state: AppState.currentState,
      ...extra,
    });
  };

  // App foreground/active is not a reactive store — bump state on transitions so
  // the effect re-evaluates the instant the user unlocks back into the app.
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);

  // TICKER: while a connected call hasn't landed, bump `tick` so the evaluator
  // below re-runs on a clock, independent of any reactive dependency firing.
  const [tick, setTick] = useState(0);
  const ticksForSid = useRef<{ sid: string; n: number } | null>(null);
  useEffect(() => {
    if (!isCallConnected(callState) || !callSid) return;
    if (landedForSid.current === callSid) return;
    const interval = setInterval(() => {
      const t = ticksForSid.current;
      ticksForSid.current =
        t && t.sid === callSid ? { sid: callSid, n: t.n + 1 } : { sid: callSid, n: 1 };
      if (ticksForSid.current.n > MAX_TICKS) {
        clearInterval(interval);
        return;
      }
      setTick((v) => v + 1);
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [callState, callSid]);

  useEffect(() => {
    if (!isCallConnected(callState) || !callSid) return;
    if (landedForSid.current === callSid) return;
    const tickN = ticksForSid.current?.sid === callSid ? ticksForSid.current.n : 0;
    // Report the blocking gate WITHOUT spamming: after ~4.5s of blockage emit ONE
    // blocked_<reason> row (so even a short call tells us its first real blocker),
    // and if the 60s budget runs out, ONE gave_up_<reason> naming the final one.
    const blockedBy = (reason: string, extra?: Record<string, unknown>) => {
      if (tickN >= 3) logSkip(callSid, `blocked_${reason}`, { ...extra, ticks: tickN });
      if (tickN >= MAX_TICKS)
        logSkip(callSid, `gave_up_${reason}`, { ...extra, ticks: tickN });
    };

    // Relief: without the flag we never auto-open the editor (OOM mitigation).
    // Imperative read beats a stale reactive value; either source unlocks.
    const autoLand =
      autoLandFlagReactive ||
      analytics.isFeatureEnabled(INCALL_EDITOR_AUTOLOAD_FLAG) === true;
    if (!autoLand) {
      blockedBy('flag_off');
      return;
    }
    if (!appActive) {
      blockedBy('not_active');
      return; // only act once we're actually foregrounded
    }
    if (!navReady) {
      blockedBy('nav_not_ready');
      return;
    }
    // /call owns its own hand-off; the recorder means we already landed.
    if (isOnCallScreen(pathname) || pathname.includes('/recording')) {
      landedForSid.current = callSid;
      logSkip(callSid, 'already_on_target', { pathname });
      return;
    }
    if (role !== 'creator') {
      // Definitive for this call (role does not change mid-call).
      logSkip(callSid, 'not_creator', { role: role ?? null });
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
      // Already fetched for this call. Still loading → the ticker re-checks. If
      // the fetch FAILED (transient network on cold launch), don't strand the
      // creator — land optimistically; the recorder tolerates an unresolved sub.
      if (!lastFetchFailed) {
        blockedBy('sub_unresolved');
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
      ticks_to_land: tickN,
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
    autoLandFlagReactive,
    tick,
  ]);
}
