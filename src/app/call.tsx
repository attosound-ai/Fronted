import React, { useEffect } from 'react';
import { StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router, useRootNavigationState } from 'expo-router';
import * as Sentry from '@sentry/react-native';
import { Text } from '@/components/ui/Text';
import { useCallStore } from '@/stores/callStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import {
  acceptIncomingCall,
  rejectIncomingCall,
  hangUpCall,
} from '@/hooks/useTwilioVoice';
import { IncomingCallScreen } from '@/components/call/IncomingCallScreen';
import { OutgoingCallScreen } from '@/components/call/OutgoingCallScreen';
import { COLORS } from '@/constants/theme';

/**
 * Hand off from the /call fullScreenModal back to the tabs once the call is no
 * longer in an interactive ringing state.
 *
 * We deliberately land on the tabs (NOT push the recorder) because:
 *  - The global `CallBanner` already owns the connected-call UI on the tabs and
 *    lets record-plan users jump into the recorder with one tap. Routing there
 *    is the same proven path free/pro users take.
 *  - The previous `dismiss()` + delayed `push('/(tabs)/recording')` raced the
 *    modal's slide-out animation: the push landed while /call was still
 *    dismissing, stranding the user on a black screen (Bug #2, reproduced).
 *
 * In-app calls have a modal stack → `dismiss()` pops /call back to the tabs.
 * A cold-launch / background answer via CallKit booted straight into /call with
 * no modal to pop → `replace('/(tabs)')`.
 */
function handOff(trigger: string = 'effect') {
  // Record / Record-Pro users land DIRECTLY on the recorder when the call
  // connects (free users land on the tabs and use the CallBanner). `replace`
  // is one atomic navigation — it avoids the dismiss()+delayed-push race that
  // previously stranded record users on a black screen.
  //
  // CRITICAL (mother test: "answered from the lock screen → bounced back to the
  // feed instead of record"): on a cold-launch / background CallKit answer the
  // subscription store may not have rehydrated/fetched yet, so
  // hasEntitlement('record_upload') would transiently return false and send a
  // paying rep to the feed. Use the tri-state entitlementState instead:
  //   true  → definitely entitled → record
  //   null  → UNKNOWN (store not loaded yet) → record anyway. The receiving side
  //           of a call is a representative (record-capable); optimistically land
  //           on record and let recording.tsx bounce to the feed only if the plan
  //           later resolves to genuinely free. This is what makes "always land
  //           on record, even answered outside the app" hold.
  //   false → definitely free → feed.
  const store = useSubscriptionStore.getState();
  const ent = store.entitlementState('record_upload');
  const goRecord = ent === true || ent === null;

  analytics.capture(ANALYTICS_EVENTS.CALL.NAV_TO_RECORD, {
    outcome: goRecord ? 'reached_record' : 'bounced_to_feed',
    trigger,
    entitlement_record_upload: ent, // true | false | null(unknown)
    subscription_hydrated: store.hasHydrated,
    subscription_loading: store.isLoading,
    plan: store.getPlan(),
    can_dismiss: router.canDismiss(),
  });

  if (goRecord) {
    router.replace('/(tabs)/recording');
    return;
  }
  if (router.canDismiss()) {
    router.dismiss();
  } else {
    router.replace('/(tabs)');
  }
}

export default function CallScreen() {
  const { t } = useTranslation('calls');
  const activeCall = useCallStore((s) => s.activeCall);
  const state = activeCall?.state;

  const showingConnectingFallback = state !== 'ringing' && state !== 'ringing-outgoing';

  // expo-router readiness. On a COLD-LAUNCH CallKit answer, /call can mount before
  // the root navigator exists; router.replace() then silently no-ops and the user
  // is stranded on the fallback. useRootNavigationState()?.key is the official
  // "navigator is mounted" signal — we defer the hand-off until it's truthy.
  const rootNavState = useRootNavigationState();
  const navReady = rootNavState?.key != null;

  // Hand off whenever we're not on an interactive ringing screen (connected,
  // connecting, reconnecting, or the call cleared) — but only once the router is
  // ready, or the replace() would no-op and leave us on the fallback forever.
  // navReady is a dependency, so if the router becomes ready a beat LATE this
  // effect re-runs and re-drives the hand-off — that (not a timer) is what covers
  // the cold-launch "router mounted late" case. We deliberately do NOT arm a
  // setInterval retry: on the normal in-app accept the fullScreenModal stays
  // mounted through its ~500ms slide-out, so a 400ms timer fired a SECOND
  // replace() + duplicate NAV_TO_RECORD telemetry mid-animation. The visible
  // "Connecting…" fallback + the tap-to-hand-off escape hatch + the 2500ms Sentry
  // backstop below already cover the (rare) genuine strand.
  useEffect(() => {
    if (state === 'ringing' || state === 'ringing-outgoing') return;
    if (!navReady) return;

    analytics.capture(ANALYTICS_EVENTS.CALL.SCREEN_CONNECTED_NAV, {
      state: state ?? 'null',
      target: '/(tabs)',
      can_dismiss: router.canDismiss(),
    });

    handOff('effect');
  }, [state, navReady]);

  // If the hand-off above somehow failed and we're STILL mounted on the fallback a
  // couple seconds later, the user is stranded — record it. On a successful
  // hand-off this component unmounts and the timer is cleared, so this only fires
  // for genuine dead-ends. (The fallback is now a visible "Connecting…" screen, not
  // a black void, so even a strand is no longer a black screen — see render below.)
  useEffect(() => {
    if (!showingConnectingFallback) return;
    const t = setTimeout(() => {
      analytics.capture(ANALYTICS_EVENTS.CALL.SCREEN_BLACK_FALLBACK, {
        state: state ?? 'null',
        nav_ready: navReady,
      });
      Sentry.captureMessage('Call screen stranded on connecting fallback', {
        level: 'warning',
        tags: { feature: 'twilio-voice', step: 'call-screen-handoff' },
      });
    }, 2500);
    return () => clearTimeout(t);
  }, [showingConnectingFallback, state, navReady]);

  if (state === 'ringing') {
    return (
      <IncomingCallScreen
        fromNumber={activeCall!.fromNumber}
        callerUsername={activeCall!.callerUsername}
        onAccept={acceptIncomingCall}
        onReject={rejectIncomingCall}
      />
    );
  }

  if (state === 'ringing-outgoing') {
    return (
      <OutgoingCallScreen
        recipientName={
          activeCall!.recipientName ||
          activeCall!.recipientId ||
          t('outgoing.unknownRecipient')
        }
        onCancel={hangUpCall}
      />
    );
  }

  // Visible connecting screen shown for any non-ringing state (connected /
  // connecting / reconnecting) while the hand-off runs. It is ALSO the tappable
  // escape hatch and last resort: tapping forces the hand-off. CRITICAL: this must
  // never be an empty black View — a call answered from OUTSIDE the app that briefly
  // strands here (cold-launch router not ready) must still show a legitimate UI, not
  // a black screen. The navReady gate + retry above normally hand off in a beat.
  return (
    <Pressable style={styles.container} onPress={() => handOff('tap')}>
      <ActivityIndicator color="#FFFFFF" size="large" />
      <Text style={styles.connectingText}>
        {t('status.connecting', { defaultValue: 'Connecting…' })}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  connectingText: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_500Medium',
    fontSize: 16,
  },
});
