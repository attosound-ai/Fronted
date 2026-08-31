import { useCallback } from 'react';
import { useCallStore } from '@/stores/callStore';
import { useAuthStore } from '@/stores/authStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useFeatureFlag } from '@/lib/analytics';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import {
  getAudioInjector,
  AUDIO_INJECTION_FLAG,
} from '@/lib/callAudio/createAudioInjector';
import type {
  InjectResult,
  InjectSource,
  InjectReason,
} from '@/lib/callAudio/AudioInjector';
import { showToast } from '@/components/ui/Toast';
import i18n from '@/lib/i18n';
import { getConnectivity } from '@/lib/net/connectivity';

/**
 * Turn an injection failure into the clearest possible one-line toast. A timeout
 * or a bare download failure is disambiguated by a live connectivity check, so an
 * offline user is told they are offline (not a vague "couldn't send"), while a
 * weak-signal user is told to tap again (the track may have finished caching in
 * the background and the retry will be instant). `superseded` shows nothing: the
 * user cancelled it themselves.
 */
async function showInjectFailureToast(reason?: InjectReason): Promise<void> {
  // Every user-visible transmit failure lands a row (b152): the Aug 15 cold-call
  // "Couldn't send that into the call" left NOTHING queryable and the diagnosis
  // had to come from device-install snapshots. The toast IS the user's
  // experience — it must never be telemetry-silent.
  // showToast returns whether a mounted host DISPLAYED it; report that truth.
  // On Aug 30 this event said toast_shown while no host existed and the user
  // saw nothing — an emitted event is not a shown toast.
  const toastResult = (toast: string, message: string) => {
    const shown = showToast(message);
    analytics.capture(ANALYTICS_EVENTS.CALL.AUDIO_INJECT_FAILED, {
      outcome: shown ? 'toast_shown' : 'toast_no_host',
      toast,
      reason: reason ?? 'unknown',
    });
  };
  if (reason === 'superseded' || reason === 'not_permitted') return;
  if (reason === 'prepare_timeout' || reason === 'prepare_failed') {
    const conn = await getConnectivity();
    if (!conn.online) {
      toastResult('offline', i18n.t('calls:transmit.offline'));
    } else if (reason === 'prepare_timeout' || conn.weak) {
      toastResult('weak_signal', i18n.t('calls:transmit.weakSignal'));
    } else {
      toastResult('failed', i18n.t('calls:transmit.failed'));
    }
    return;
  }
  // engine_error, not_connected, no_active_call, not_supported: a plain failure.
  toastResult('failed', i18n.t('calls:transmit.failed'));
}

/**
 * useCallAudioInjection — the thin orchestration boundary the UI consumes to
 * play a phone-side track INTO the live call. It depends ONLY on the
 * AudioInjector contract (via the factory), never on a concrete engine, so the
 * native/server choice is invisible here (Dependency Inversion).
 *
 * Gating mirrors DTMF exactly: an action is only allowed on a `connected` call.
 * Every inject() lands a queryable AUDIO_INJECT_ATTEMPT with an `outcome` so no
 * path is ever silent. With the feature flag OFF (Phase-0 default) `canInject`
 * is false and the button never mounts.
 */
export function useCallAudioInjection() {
  const flagEnabled = useFeatureFlag(AUDIO_INJECTION_FLAG) === true;
  const callState = useCallStore((s) => s.activeCall?.state);
  const injection = useCallStore((s) => s.injection);

  // Entitlement gate: injection is for CREATORS with an ACTIVE subscription
  // (David, Jul 21). The PostHog flag scopes to role=creator server-side, but a
  // person property can't express "active subscription" reliably, so the sub is
  // enforced here against the app's live entitlement state. record_upload is the
  // same marker useConnectedCallLanding uses for a paid, recording-capable plan;
  // null (cold-launch, sub not resolved yet) is treated as not-yet-allowed.
  const role = useAuthStore((s) => s.user?.role);
  const recordUpload = useSubscriptionStore((s) => s.entitlementState('record_upload'));
  const isCreator = role === 'creator';
  const hasActiveSub = recordUpload === true;

  const isConnected = callState === 'connected';
  const canInject = flagEnabled && isConnected && isCreator && hasActiveSub;
  const isInjecting = injection?.state === 'playing' || injection?.state === 'preparing';
  // Preparing = downloading/decoding, before any audio is scheduled. The button
  // shows a spinner in this window so a slow prepare never reads as a dead tap.
  const isPreparing = injection?.state === 'preparing';

  const isTrackInjecting = useCallback(
    (uri: string) => isInjecting && injection?.source?.uri === uri,
    [isInjecting, injection?.source?.uri]
  );

  const inject = useCallback(async (source: InjectSource): Promise<InjectResult> => {
    const call = useCallStore.getState().activeCall;
    const ctx = {
      call_sid: call?.callSid ?? null,
      call_state: call?.state ?? null,
      since_connected_ms: call?.connectedAt
        ? Date.now() - new Date(call.connectedAt).getTime()
        : null,
      source_kind: source.kind,
      is_video: source.isVideo ?? false,
      post_id: source.postId ?? null,
    };

    const land = (outcome: string, reason?: InjectReason) =>
      analytics.capture(ANALYTICS_EVENTS.CALL.AUDIO_INJECT_ATTEMPT, {
        ...ctx,
        outcome,
        reason: reason ?? null,
      });

    if (!call) {
      land('no_active_call', 'no_active_call');
      return { ok: false, reason: 'no_active_call' };
    }
    if (call.state !== 'connected') {
      land('not_connected', 'not_connected');
      return { ok: false, reason: 'not_connected' };
    }
    // Defense in depth: the 📡 button already hides when canInject is false, but
    // never inject without the creator + active-subscription entitlement even if
    // reached another way. Read live state (getState) since this closure is stable.
    const injectRole = useAuthStore.getState().user?.role;
    const injectSub =
      useSubscriptionStore.getState().entitlementState('record_upload') === true;
    if (injectRole !== 'creator' || !injectSub) {
      land('not_permitted', 'not_permitted');
      return { ok: false, reason: 'not_permitted' };
    }

    const result = await getAudioInjector().start(source);
    land(result.ok ? 'started' : (result.reason ?? 'engine_error'), result.reason);
    if (result.ok) {
      analytics.capture(ANALYTICS_EVENTS.CALL.AUDIO_INJECT_STARTED, ctx);
    } else {
      analytics.capture(ANALYTICS_EVENTS.CALL.AUDIO_INJECT_FAILED, {
        ...ctx,
        reason: result.reason ?? null,
      });
      // NEVER fail silently. The user tapped a button and heard nothing; tell
      // them why, and which failures are worth retrying. `superseded` is the one
      // case with no toast: the user themselves cancelled it by tapping off.
      await showInjectFailureToast(result.reason);
    }
    return result;
  }, []);

  const stop = useCallback(async (reason: InjectReason = 'user_stopped') => {
    const t0 = Date.now();
    await getAudioInjector().stop(reason);
    const call = useCallStore.getState().activeCall;
    analytics.capture(ANALYTICS_EVENTS.CALL.AUDIO_INJECT_STOPPED, {
      call_sid: call?.callSid ?? null,
      reason,
      // How long the native stop took to resolve. The Aug 3 ghost test showed
      // injected frames still flowing ~2s after this event landed; this number
      // separates "the bridge call sat in a busy queue" from "the stop ran
      // instantly and something re-scheduled afterwards".
      stop_await_ms: Date.now() - t0,
    });
  }, []);

  return {
    canInject,
    isInjecting,
    isPreparing,
    isTrackInjecting,
    inject,
    stop,
    injection,
  };
}
