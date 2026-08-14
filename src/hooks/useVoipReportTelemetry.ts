import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { getCallAudioState } from '@/lib/telemetry/deviceSnapshot';
import { reportUnreportedCallDeath } from '@/lib/telemetry/callTelemetry';
import { mmkvStorage } from '@/lib/storage/mmkv';

/** Dedup key so one VoIP push is reported once, even across app launches. */
const LAST_REPORTED_PUSH_KEY = 'atto_last_reported_voip_push_at';

/**
 * Surface the NATIVE CallKit/PushKit funnel to PostHog.
 *
 * WHY THIS WAS REWRITTEN: the first version read the AppDelegate's NSUserDefaults
 * markers through React Native's `Settings.get`. That silently never worked —
 * verified against production data, `call_voip_push_outcome` had **zero** events
 * while every other call event fired normally. RN's Settings module snapshots
 * NSUserDefaults at module init, so values written natively during a VoIP push
 * (often before/while RN boots) are simply not visible to it.
 *
 * The reliable path already existed: the patched `RNDeviceInfo.getCallAudioState`
 * native module returns the markers the native side stamps — `voipPushAt`,
 * `voipPushAppState`, `answerActionAt`, `didActivateAt`, `callConnectAt`. That is a
 * real native read every time, not a stale constants snapshot, and it gives us the
 * whole chain: push arrived → CallKit answer action → audio session activated →
 * call connected. Those gaps are exactly what distinguishes "the push never woke
 * us" from "we answered but audio never activated" (the documented Apple DTS
 * failure where a call connects with no microphone).
 *
 * Memory warnings now come from RN's own `AppState` 'memoryWarning' event — a
 * documented cross-platform API — instead of the same broken NSUserDefaults path.
 */
export function useVoipReportTelemetry(): void {
  const lastPushAtRef = useRef<number | null>(null);

  useEffect(() => {
    // Runs on every platform: if a call was in flight when the process died, this
    // is where that silent death finally gets reported.
    reportUnreportedCallDeath();

    if (Platform.OS !== 'ios') return;

    const emitPushFunnelIfNew = async () => {
      try {
        const s = await getCallAudioState();
        if (!s) return;
        const pushAt = s.voipPushAt;
        if (!pushAt || pushAt <= 0) return;

        // Dedup within the session AND across launches (the interesting pushes are
        // exactly the ones where the app was killed and relaunched).
        if (lastPushAtRef.current === pushAt) return;
        const persisted = mmkvStorage.getString(LAST_REPORTED_PUSH_KEY);
        if (persisted === String(pushAt)) {
          lastPushAtRef.current = pushAt;
          return;
        }
        lastPushAtRef.current = pushAt;
        mmkvStorage.setString(LAST_REPORTED_PUSH_KEY, String(pushAt));

        const answerAt = s.answerActionAt > 0 ? s.answerActionAt : null;
        const activateAt = s.didActivateAt > 0 ? s.didActivateAt : null;
        const connectAt = s.callConnectAt > 0 ? s.callConnectAt : null;
        const since = (t: number | null) =>
          t != null && t >= pushAt ? Math.round((t - pushAt) * 1000) : null;

        analytics.capture(ANALYTICS_EVENTS.CALL.VOIP_PUSH_OUTCOME, {
          // Native UIApplicationState at push arrival (0=active,1=inactive,2=bg).
          push_app_state: s.voipPushAppState ?? null,
          // The chain. A null here is the finding: it says how far we got.
          answered: answerAt != null,
          audio_activated: activateAt != null,
          call_connected: connectAt != null,
          push_to_answer_ms: since(answerAt),
          push_to_audio_activate_ms: since(activateAt),
          push_to_connect_ms: since(connectAt),
          // Answered but the audio session never activated = the documented
          // "connects with no microphone" failure.
          answered_without_audio: answerAt != null && activateAt == null,
          live_category: s.liveCategory ?? null,
          live_input_port: s.liveInputPort ?? null,
          // The report funnel: did we take the warm or the COLD path, and did the
          // report to CallKit succeed? This is what tells us the cold-launch crash
          // fix (build 142) actually held — a "cold" path with "cold_reported" and
          // no crash on the next launch is the proof. A "warm" path on a
          // background push (push_app_state != 0) would be the old, crashing bug.
          report_path: s.voipReportPath || null,
          report_outcome: s.voipReportOutcome || null,
          report_attempt:
            typeof s.voipReportAttempt === 'number' ? s.voipReportAttempt : null,
          report_to_outcome_ms:
            s.voipReportAt && s.voipReportAt >= pushAt
              ? Math.round((s.voipReportAt - pushAt) * 1000)
              : null,
          // COLD-CALL funnel (build 146): every native step of a cold-launch call
          // as a delta from the push. A null marks exactly where the chain broke:
          // decode failed / never answered / accept failed / module never woke /
          // handoff never posted / module never adopted. cold_handoff_delta
          // (posted vs adopted counts) > 0 means calls were LOST in the handoff.
          cold_invite_decoded_ms: since(s.coldInviteDecodedAt ?? null),
          cold_answer_action_ms: since(s.coldAnswerActionAt ?? null),
          cold_accept_ms: since(s.coldAcceptAt ?? null),
          cold_connected_ms: since(s.coldConnectedAt ?? null),
          cold_module_init_ms: since(s.coldModuleInitAt ?? null),
          cold_handoff_posted_ms: since(s.coldHandoffPostedAt ?? null),
          cold_handoff_adopted_ms: since(s.coldHandoffAdoptedAt ?? null),
          cold_handoff_posted_count: s.coldHandoffPostedCount ?? null,
          cold_handoff_adopted_count: s.coldHandoffAdoptedCount ?? null,
          cold_disconnect_forwarded_ms: since(s.coldDisconnectForwardedAt ?? null),
          // Join key to call_* events (same Twilio CallSid) and to the Sentry
          // cold_callkit breadcrumbs of any crash in this window.
          cold_call_sid: s.coldLastCallSid || null,
        });
      } catch {
        // Best-effort telemetry; never affect the call path.
      }
    };

    void emitPushFunnelIfNew();
    const stateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void emitPushFunnelIfNew();
    });

    // iOS memory warning via RN's own event (the NSUserDefaults path never worked).
    // Fires BEFORE jetsam, so it is the earliest warning on the OOM path.
    const memSub = AppState.addEventListener('memoryWarning', () => {
      analytics.capture(ANALYTICS_EVENTS.CALL.MEMORY_WARNING, {
        app_state: AppState.currentState,
      });
    });

    return () => {
      stateSub.remove();
      memSub.remove();
    };
  }, []);
}
