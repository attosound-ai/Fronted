import { useEffect, useCallback } from 'react';
import { Platform, AppState, NativeModules, Settings } from 'react-native';
import { setAudioModeAsync, AudioModule } from 'expo-audio';
import { router } from 'expo-router';
import { useCallStore } from '@/stores/callStore';
import { useAccountStore } from '@/stores/accountStore';
import { telephonyService } from '@/lib/api/telephonyService';
import { useAuthStore } from '@/stores/authStore';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { haptic } from '@/lib/haptics/hapticService';
import { playEndCallSound } from '@/lib/sound/callSounds';
import * as Sentry from '@sentry/react-native';
import {
  startCallTelemetry,
  endCallTelemetry,
  telemetryCounters,
  captureCallAudioSnapshot,
  setSpeakerOutput,
  registerCallStatsSampler,
} from '@/lib/telemetry';
// Not re-exported from '@/lib/telemetry', so imported from the module directly, the
// same way useVoipReportTelemetry does. This is the LIVE AVAudioSession read
// (category / mode / ports / sample rate) that every session-write record below
// uses for its before/after pair.
import {
  getCallAudioState,
  resolveRouteChangeReason,
  formatRouteChangeRing,
  showAudioRoutePicker,
} from '@/lib/telemetry/deviceSnapshot';

// Lazy-load Twilio Voice SDK — the native module requires Firebase (google-services.json)
// which is not yet configured for Android. Importing at module level crashes Android on launch.
type TwilioTypes = typeof import('@twilio/voice-react-native-sdk');
let _twilio: TwilioTypes | null = null;
function getTwilio(): TwilioTypes {
  if (!_twilio) {
    _twilio = require('@twilio/voice-react-native-sdk');
  }
  return _twilio!;
}

const IS_IOS = Platform.OS === 'ios';
const TOKEN_REFRESH_MS = 50 * 60 * 1000; // Refresh every 50 minutes

// ── Feature gate: connect-time audio-session sequencing ─────────────────────
// Guards the two BEHAVIOUR changes on the live answer path: (1) serialising the
// connect-time session work into one in-flight task and dropping the duplicate
// route override, and (2) letting reclaimAudioSession skip its category rewrite
// when the session is already healthy. Everything else added alongside them is
// pure instrumentation and ships ungated. A missing / not-yet-loaded flag reads
// as `undefined`, so `=== true` means the shipped behaviour is preserved exactly
// for everyone outside the cohort. Roll out on David's account (210) first;
// never enable a new call-path flag on 152 / 153 before that.
const FLAG_CONNECT_SESSION_SEQUENCING = 'call_connect_session_sequencing';

function isConnectSequencingEnabled(): boolean {
  try {
    return analytics.isFeatureEnabled(FLAG_CONNECT_SESSION_SEQUENCING) === true;
  } catch {
    // PostHog not initialised yet (cold launch answered by CallKit), so treat as off.
    return false;
  }
}

// ── No-call audio-mode restore retry schedule ──────────────────────────────
// The no-call effect skips its write while something else still owns a capture
// session, and it only re-runs on a hasAnyCall transition, so a skip that is never
// retried strands playsInSilentMode for the entire session (this is the app's only
// global setter of it). Fast retries cover the common case, a teardown that has
// not finished; the slow ones cover a genuine long recording. Unbounded on
// purpose: one native read every 10 s while idle is nothing, and the alternative
// is silent media for anyone with the ring switch on.
const NO_CALL_RESTORE_FAST_ATTEMPTS = 10;
const NO_CALL_RESTORE_FAST_MS = 1500;
const NO_CALL_RESTORE_SLOW_MS = 10_000;
// Only the first few skips emit a row; after that the retry is silent and the
// eventual successful write carries the attempt number.
const NO_CALL_RESTORE_REPORTED_ATTEMPTS = 3;

/** Delay used by the connect sequence; kept as a promise so it can be awaited. */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Singleton state (module-level) ──
// Captured at module load — proxies "process started at" to tell a cold launch
// (the call woke a killed app) from a warm one. Module loads early at app start.
const MODULE_LOAD_MS = Date.now();

let voiceInstance: any = null;
let pushKitReady = false;
let activeCallObj: any = null;
let activeCallTeardown: (() => void) | null = null;
let pendingInvite: any = null;
let lastToken: string | null = null;
// Which account ID the currently-registered Twilio identity belongs to.
// Used by the multi-account switch flow: when activeAccountId changes we
// must unregister the old identity and register the new one — otherwise
// incoming calls keep routing to the previous account's Voice SDK client.
let activeIdentityAccountId: number | null = null;
// Monotonic generation counter for register/unregister attempts. Any
// attempt that detects its gen has been superseded (e.g., the user
// switched accounts again before its register fully completed) aborts
// or undoes itself, preventing stale identities from sticking around.
// Replaces the legacy `isRegistering` boolean: with the gen counter,
// concurrent attempts are no longer blocked outright — they are
// invalidated, which is the only correct behavior when a switch
// happens mid-register.
let currentRegistrationGen = 0;
// Reentrancy guard for the audio-route picker — repeated speaker toggles
// during a call were one of the WatchdogTermination triggers seen in
// REACT-NATIVE-8 (sessions that crashed had `call_speaker_toggled` as
// their last event). Only one toggle may be in-flight at a time.
let isSpeakerToggling = false;
// Reentrancy guard for DTMF. Mirrors `isSpeakerToggling`: only one
// sendDigits() may be in flight at a time so a double-tap on the keypad
// cannot stack native calls on the same Call object.
let isSendingDigits = false;

// ── Consolidated per-call CONTEXT stash (call_context telemetry) ──
// Everything we want to know to reconstruct a failed call WITHOUT interrogating
// the user: who called whom, app-to-app vs carrier/Securus, was the app open /
// backgrounded / a cold launch, how it was answered, and (via the live audio
// snapshot at connect) whether audio actually came up. Populated at invite /
// outbound-start and answer; emitted as ONE flat `call_context` row at connect
// and disconnect. Reset by endCall.
interface CallContextStash {
  callSid: string | null;
  direction: 'inbound' | 'outbound' | null;
  localAccountId: number | null;
  callerFrom: string | null; // invite.getFrom() — PSTN number ⇒ carrier/Securus, `client:x` ⇒ app
  calleeTo: string | null;
  targetUserId: number | null;
  customParamKeys: string | null;
  appStateAtInvite: string | null;
  inviteAtMs: number | null;
  processUptimeAtInviteSec: number | null; // low ⇒ cold launch (app started by the call)
  answerBranch: string | null;
  appStateAtAnswer: string | null;
  answerAtMs: number | null;
  disconnectCode: number | null;
  disconnectMessage: string | null;
  cleanHangup: boolean | null;
  // Invite-time AVAudioSession baseline, filled asynchronously right after the
  // invite/outbound-start snapshot. THE trigger variable: a call that arrives
  // while the AirPods are an active A2DP media sink has to switch the headset out
  // of music mode at the exact instant the call is starting.
  inviteAudioCategory: string | null;
  inviteAudioMode: string | null;
  inviteInputPort: string | null;
  inviteOutputPort: string | null;
  inviteSampleRate: number | null;
  inviteOtherAudioPlaying: boolean | null;
}
let callContextStash: CallContextStash | null = null;
// call_context is emitted at most once per (callSid, trigger); guards the
// connect/disconnect double-fire and any handler re-entry.
const callContextEmitted = new Set<string>();

// Classify the call by its caller identity. Securus/prison-carrier legs arrive
// as a PSTN number (the inmate dials the bridge → Twilio → us); genuine
// app-to-app calls arrive as a `client:<identity>` address.
function classifyCallType(from: string | null): string {
  if (!from) return 'unknown';
  const f = from.trim();
  if (f.toLowerCase().startsWith('client:')) return 'app_to_app';
  if (/^\+?\d[\d\s()-]{5,}$/.test(f)) return 'carrier_pstn';
  return 'unknown';
}

// NOTE: Securus "press 1" is handled by the in-call KEYPAD (DtmfKeypadHost
// auto-opens on an inbound connect and the user taps 1) — per David's call, we do
// NOT auto-send the DTMF. The auto-accept scheduler was removed here; the manual
// keypad is the accept path, as it worked before.

function getVoice(): any {
  if (!voiceInstance) {
    const { Voice } = getTwilio();
    voiceInstance = new Voice();
  }
  return voiceInstance;
}

/**
 * Unregister the currently-registered Twilio identity, if any. Idempotent
 * and safe to call when nothing is registered. Errors are swallowed and
 * reported to Sentry: registering a new identity on the same APNS device
 * token supersedes the old binding server-side anyway, so a failed
 * unregister never strands the device — it only loses an analytics signal.
 */
async function unregisterCurrent(): Promise<void> {
  if (!lastToken) return;
  const tok = lastToken;
  const prevAccountId = activeIdentityAccountId;
  lastToken = null;
  activeIdentityAccountId = null;
  try {
    await getVoice().unregister(tok);
    analytics.capture(ANALYTICS_EVENTS.CALL.TWILIO_UNREGISTERED, {
      account_id: prevAccountId,
    });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { feature: 'twilio-voice', step: 'unregister' },
      extra: { account_id: prevAccountId },
    });
  }
}

/** Expose the active call object for audio session recovery. */
export function getActiveCallObj(): any {
  return activeCallObj;
}

// ── Helpers ──

/**
 * Twilio Voice SDK passes the caller's identity as `client:user-{id}` for
 * app-to-app calls. Extract the numeric userId so we can resolve the
 * username via the user-service. Returns null otherwise (e.g., PSTN E.164).
 */
function parseTwilioClientIdentity(identity: string): number | null {
  const match = identity.match(/^client:user-(\d+)$/);
  return match ? Number(match[1]) : null;
}

/** Match a raw E.164 phone number (e.g., `+16812932367`). */
function isE164(value: string): boolean {
  return /^\+\d{8,15}$/.test(value);
}

/**
 * Resolve the userId behind a phone number that's an active bridge in
 * `phone_number_assignments`. Returns null if no assignment exists.
 */
async function lookupUserIdByPhoneNumber(phoneNumber: string): Promise<number | null> {
  try {
    const { data } = await apiClient.get(API_ENDPOINTS.TELEPHONY.NUMBER_LOOKUP, {
      params: { phoneNumber },
    });
    const uid = data?.data?.userId;
    if (uid == null) return null;
    const numeric = Number(uid);
    return Number.isFinite(numeric) ? numeric : null;
  } catch {
    return null;
  }
}

async function resolveCallerUsername(identity: string): Promise<void> {
  let userId = parseTwilioClientIdentity(identity);

  // Bridge-number caller: reverse-lookup the number → owning user.
  if (userId == null && isE164(identity)) {
    userId = await lookupUserIdByPhoneNumber(identity);
  }

  if (userId == null) return;

  try {
    const { data } = await apiClient.get(API_ENDPOINTS.USERS.PROFILE(userId));
    const username = data?.data?.username;
    if (username) useCallStore.getState().setCallerUsername(username);
  } catch {
    // Best-effort: if lookup fails, screen falls back to the raw identity.
  }
}

/**
 * Wire the Twilio Call event listeners and return an explicit teardown that
 * calls `.off()` for every registered listener. Without this, every Call
 * object accumulates 5 listeners that hold closures over the call store —
 * the secondary suspect for the WatchdogTermination cluster (REACT-NATIVE-8).
 * Teardown is also stored at module level so terminate paths
 * (hangUpCall, etc.) can force-detach if the SDK skips `Disconnected`.
 */
// ── WebRTC call-quality telemetry ──────────────────────────────────────────
// Periodic Call.getStats() while connected. Directly measures audio FLOW — the
// mic's outbound level + bytes, the remote's inbound level + bytes, packet loss,
// jitter, MOS, RTT — the ground truth for "no audio / one-way / bad quality"
// that the AVAudioSession category alone can't give. `mic_audio_level`+
// `bytes_sent` == 0 is the no-mic signature; `remote_audio_level`+
// `bytes_received` == 0 means we're not hearing them. Emitted as
// `call_quality_stats`; SDK quality warnings as `call_quality_warning`.
let callStatsInterval: ReturnType<typeof setInterval> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StatsBag = Record<string, any>;

interface PickedCallStats {
  local: StatsBag;
  remote: StatsBag;
  ice: StatsBag;
  reportsLen: number;
}

/**
 * THE fix for "every call-quality field has been null since launch".
 *
 * `Call.getStats()` is DECLARED as `Promise<RTCStats.StatsReport>`, one object,
 * in the SDK's TypeScript surface (node_modules/@twilio/voice-react-native-sdk/
 * src/Call.tsx). The native bridge resolves something else entirely: an NSArray
 * of per-peer-connection reports (TwilioVoiceReactNative.m `call_getStats` →
 * `[TwilioVoiceStatsReport jsonWithStatsReportsArray:]`). Reading
 * `report.localAudioTrackStats[0]` off an ARRAY yields undefined, so all ~20
 * fields of `call_quality_stats` resolved to null on every call for every user
 * since the feature shipped. That is exactly why the AirPods no-audio incident
 * could not be answered ("was the remote audio arriving at all?").
 *
 * Both readers of this shape go through here so they can never drift apart again.
 * Reports are flattened rather than indexed: a call normally has a single peer
 * connection, but on a reconnect there can be more than one and the tracks may
 * live on either.
 */
function pickTrackStats(report: unknown): PickedCallStats {
  const reports: StatsBag[] = Array.isArray(report)
    ? (report as StatsBag[])
    : report
      ? [report as StatsBag]
      : [];
  const collect = (key: string): StatsBag[] =>
    reports.flatMap((r) => (Array.isArray(r?.[key]) ? (r[key] as StatsBag[]) : []));
  const pairs = collect('iceCandidatePairStats');
  return {
    local: collect('localAudioTrackStats')[0] ?? {},
    remote: collect('remoteAudioTrackStats')[0] ?? {},
    ice: pairs.find((p) => p?.activeCandidatePair) ?? pairs[0] ?? {},
    reportsLen: reports.length,
  };
}

function flattenCallStats(report: unknown): Record<string, unknown> {
  const { local, remote, ice, reportsLen } = pickTrackStats(report);
  return {
    // How many per-peer-connection reports the bridge actually handed us. 0 means
    // the shape changed again (or media never came up); this is the tripwire that
    // makes the next silent shape change visible instead of null-by-null.
    reports_len: reportsLen,
    // Outbound — this device's microphone toward the remote party.
    mic_audio_level: local.audioLevel ?? null,
    bytes_sent: local.bytesSent ?? null,
    packets_sent: local.packetsSent ?? null,
    out_packets_lost: local.packetsLost ?? null,
    out_jitter: local.jitter ?? null,
    out_rtt: local.roundTripTime ?? null,
    out_codec: local.codec ?? null,
    // Inbound — the remote party toward this device.
    remote_audio_level: remote.audioLevel ?? null,
    // Twilio's own TypeScript type spells this `bytesRecieved` (their typo, see
    // src/type/RTCStats.ts), but BOTH native layers actually emit `bytesReceived`
    // (iOS kTwilioVoiceReactNativeBytesReceived, Android CommonConstants
    // .BytesReceived). Read both spellings; the EMITTED property name stays
    // `bytes_received` so the 369 historical rows remain comparable.
    bytes_received: remote.bytesReceived ?? remote.bytesRecieved ?? null,
    packets_received: remote.packetsReceived ?? null,
    in_packets_lost: remote.packetsLost ?? null,
    in_jitter: remote.jitter ?? null,
    mos: remote.mos ?? null,
    in_codec: remote.codec ?? null,
    // Transport (selected ICE candidate pair).
    transport_rtt: ice.currentRoundTripTime ?? null,
    relay_protocol: ice.relayProtocol ?? null,
    transport_bytes_sent: ice.bytesSent ?? null,
    transport_bytes_received: ice.bytesReceived ?? null,
  };
}

// Previous inbound sample, so every tick carries the DELTA and not only a running
// total. This is THE playout-versus-network discriminator: bytes_received climbing
// while the user hears nothing is a LOCAL render failure, bytes_received flat is a
// network or signalling failure.
//
// Keyed on the call SID, not reset by startCallStatsCapture. The reset used to live
// in startCallStatsCapture, which only ran from onConnected — and onConnected never
// fires on the CallKit answer branches. A call answered that way therefore emitted
// exactly one row, the 'final' one from onDisconnected, and diffed its cumulative
// bytes against the LAST sample of the PREVIOUS call: a large negative delta that
// reads as a corrupt value rather than as missing data. Keying on the sid makes
// that impossible regardless of which path started the sampling.
let lastBytesReceived: number | null = null;
let lastBytesReceivedAtMs: number | null = null;
let lastBytesReceivedCallSid: string | null = null;

async function captureCallStats(reason: string): Promise<Record<string, unknown> | null> {
  if (!activeCallObj) return null;
  try {
    const report = await activeCallObj.getStats();
    const ac = useCallStore.getState().activeCall;
    const sid = ac?.callSid ?? null;
    if (sid !== lastBytesReceivedCallSid) {
      lastBytesReceivedCallSid = sid;
      lastBytesReceived = null;
      lastBytesReceivedAtMs = null;
    }
    const flat = flattenCallStats(report);
    const bytesReceived =
      typeof flat.bytes_received === 'number' ? flat.bytes_received : null;
    const nowMs = Date.now();
    const bytesDelta =
      bytesReceived != null && lastBytesReceived != null
        ? bytesReceived - lastBytesReceived
        : null;
    const deltaWindowMs =
      bytesReceived != null && lastBytesReceivedAtMs != null
        ? nowMs - lastBytesReceivedAtMs
        : null;
    if (bytesReceived != null) {
      lastBytesReceived = bytesReceived;
      lastBytesReceivedAtMs = nowMs;
    }
    const payload = {
      ...flat,
      // Null on the first sample of a call (nothing to diff against yet).
      bytes_received_delta: bytesDelta,
      bytes_received_delta_ms: deltaWindowMs,
    };
    analytics.capture('call_quality_stats', {
      reason,
      call_sid: sid,
      call_state: ac?.state ?? null,
      direction: ac?.direction ?? null,
      is_muted: ac?.isMuted ?? null,
      ...payload,
    });
    return payload;
  } catch {
    // getStats() can reject before media is flowing; the next tick retries.
    return null;
  }
}

/**
 * Sample the WebRTC stats RIGHT NOW and return them, in addition to emitting the
 * usual `call_quality_stats` row. Registered with callTelemetry so a user-tapped
 * audio-problem report carries the byte counters on its own row, at its own
 * timestamp, instead of being joined to whichever periodic sample happens to be
 * nearest (a delta that straddles both the failure and the recovery).
 */
registerCallStatsSampler((reason: string) => captureCallStats(reason));

/** Twilio audioLevel may arrive as 0..1 or 0..32767; map to a punchy 0..1 value. */
function normAudioLevel(level: number | null | undefined): number {
  if (level == null) return 0;
  const unit = level > 1 ? level / 32767 : level;
  // sqrt curve + gain so normal speech visibly moves the wave (raw RMS is low).
  return Math.max(0, Math.min(1, Math.sqrt(Math.max(0, unit)) * 1.3));
}

/**
 * One-shot live audio levels for the recording-screen waveform: the local mic's
 * outbound level AND the remote party's inbound level, both normalised to 0..1.
 * Lets the visualizer react to BOTH sides of the call (Twilio records both
 * tracks; the local metering recorder only ever hears this device's mic).
 * Returns zeros when there's no call or before media flows.
 */
export async function getActiveCallAudioLevels(): Promise<{
  mic: number;
  remote: number;
}> {
  if (!activeCallObj) return { mic: 0, remote: 0 };
  try {
    const report = await activeCallObj.getStats();
    // Same array unwrap as flattenCallStats. Before this the remote channel of
    // the recording-screen waveform read zeros on every call, because the stats
    // report is an array and `.remoteAudioTrackStats[0]` on an array is undefined.
    const { local, remote } = pickTrackStats(report);
    return {
      mic: normAudioLevel(local.audioLevel),
      remote: normAudioLevel(remote.audioLevel),
    };
  } catch {
    return { mic: 0, remote: 0 };
  }
}

// Sampling cadence. Every reported audio failure so far has happened inside the
// first ~15 seconds of a call, and at a flat 10 s cadence a failure at t+7s has to
// be read off a delta covering t+0 to t+10 (dead) and one covering t+10 to t+20
// (mostly alive), i.e. averaged across both the failure and the recovery. So sample
// fast through the window that actually matters and settle down afterwards.
const STATS_FAST_MS = 2_000;
const STATS_FAST_WINDOW_MS = 15_000;
const STATS_SLOW_MS = 10_000;

let callStatsCadenceTimer: ReturnType<typeof setTimeout> | null = null;

function startCallStatsCapture() {
  // IDEMPOTENT: this is now started from onConnected AND from the CallKit-recovered
  // answer branches (where onConnected never fires), and on a normal call both can
  // happen. A second call must not restart the schedule or it would keep pushing
  // the fast window forward.
  if (callStatsInterval) return;
  // t+0 baseline so the first fast tick already carries a real delta. getStats can
  // reject this early; captureCallStats swallows that and the next tick retries.
  void captureCallStats('initial');
  callStatsInterval = setInterval(
    () => void captureCallStats('tick_fast'),
    STATS_FAST_MS
  );
  callStatsCadenceTimer = setTimeout(() => {
    callStatsCadenceTimer = null;
    if (!callStatsInterval) return;
    clearInterval(callStatsInterval);
    callStatsInterval = setInterval(() => void captureCallStats('tick'), STATS_SLOW_MS);
  }, STATS_FAST_WINDOW_MS);
}

function stopCallStatsCapture() {
  if (callStatsInterval) {
    clearInterval(callStatsInterval);
    callStatsInterval = null;
  }
  if (callStatsCadenceTimer) {
    clearTimeout(callStatsCadenceTimer);
    callStatsCadenceTimer = null;
  }
}

/**
 * Everything that must happen ONCE per call the moment it is connected, no matter
 * which path got us there.
 *
 * This exists because the entire playout-versus-network discriminator used to hang
 * off Twilio's Connected event, and this file documents in three places that
 * Connected never reaches us on the CallKit answer branches: `recovered_no_invite`,
 * `recovered_precepted` and `accepted_no_call` all fire after CallKit has already
 * accepted natively, which is why reassertCallAudioSession() exists at all. On
 * those branches startCallStatsCapture() was never called, so `call_quality_stats`
 * never ticked and there was no `call_answer_context` row either — and on
 * `recovered_no_invite` startCallTelemetry never ran, so there were no
 * `call_audio_session_changed` rows and no route-change reasons for the WHOLE call.
 * That is the lock-screen / AirPods-in / phone-in-pocket answer path: exactly the
 * one the reported incident ran on.
 *
 * Every piece is individually idempotent (startCallTelemetry no-ops while active,
 * startCallStatsCapture no-ops while sampling, captureAnswerContext dedupes on the
 * call sid), so calling this from both the answer branch and a later Connected is
 * harmless.
 */
function beginConnectedCallTelemetry(reason: string): void {
  void startCallTelemetry(reason);
  // WebRTC quality stats (mic/remote audio levels, bytes, loss, MOS, RTT).
  startCallStatsCapture();
  // One-shot answer-context row: the invite-time route versus the answer-time
  // route. The AirPods incident's only pre-answer difference between the good and
  // the bad call was that the bad one arrived while the AirPods were an active
  // A2DP media sink, and reconstructing that took grouping raw ticks by call_sid
  // across five weeks. As first-class booleans it is a one-line cohort.
  captureAnswerContext();
}

function bindCallEvents(call: any): () => void {
  const { Call } = getTwilio();
  const { setCallState, endCall } = useCallStore.getState();

  let removed = false;
  // Debounce timer for clearing the "Weak signal" chip after warnings subside.
  let qualityClearTimer: ReturnType<typeof setTimeout> | null = null;
  // Connected must run exactly once per Call object. bindCallEvents now also fires
  // it synchronously when the call is ALREADY connected at bind time (the CallKit
  // pre-accepted case), and the SDK can still deliver its own Connected afterwards.
  // Without this latch the connect-time session writes would be issued twice.
  let connectedHandled = false;

  const onConnected = () => {
    if (connectedHandled) return;
    connectedHandled = true;
    console.log(
      '[TwilioVoice] Call connected',
      JSON.stringify({ time: new Date().toISOString() })
    );
    setCallState('connected');
    // Telemetry begins capturing tick snapshots at this point — pre-connect
    // states are already covered by startCallTelemetry() at invite/outgoing.
    // Stats + answer context ride along; see beginConnectedCallTelemetry.
    beginConnectedCallTelemetry('call_connected');
    // Re-assert PlayAndRecord shortly after connect. If the rep was browsing the
    // feed when the call came in, expo-video had put the AVAudioSession in the
    // Playback category (output-only, NO mic) — build-55 telemetry proved this:
    // category=Playback / inPort=none / output on A2DP → silent both ways, while
    // a call with no media playing showed PlayAndRecord + HFP and worked.
    // reclaimAudioSession() flips it back to PlayAndRecord + mixWithOthers so the
    // call regains its microphone while feed/reel audio keeps mixing in (the rep
    // can still hear the app). The feed players are also switched to
    // `mixWithOthers` during a call (useCallAwareVideoAudio) so they stop
    // stealing the session going forward; this handles the already-playing case.
    // Delayed so Twilio's own native session setup settles first.
    //
    // FLAG `call_connect_session_sequencing`: ON runs the connect-time session
    // work as one ordered, awaited task (see runConnectSessionSequence). OFF is
    // the shipped behaviour, unchanged apart from the instrumentation wrapper
    // around the override. The two writes fire independently, the 700ms reclaim
    // on a timer and the earpiece override immediately.
    if (isConnectSequencingEnabled()) {
      void queueSessionTask(runConnectSessionSequence);
    } else {
      setTimeout(() => {
        void reclaimAudioSession();
      }, CONNECT_RECLAIM_DELAY_MS);
      // Force earpiece IMMEDIATELY too (not just at the 700ms reclaim) so the
      // window where iOS routes a "video" call to Speaker — the client's echo — is
      // as short as possible. No-op if the user chose speaker.
      if (useCallStore.getState().activeCall?.isSpeaker !== true) {
        void runSessionWrite(
          'connect_early_earpiece',
          'speaker=false',
          () => setSpeakerOutput(false),
          { sequenced: false }
        );
      }
    }
    // Consolidated call_context: fire once audio has settled (after the reclaim)
    // so the audio-session snapshot reflects the true in-call state — this is the
    // row that proves/refutes "there was no sound" against the full variable set.
    setTimeout(() => captureCallContext('connected'), 1500);
  };

  const onConnectFailure = () => {
    activeCallObj = null;
    stopCallStatsCapture();
    void endCallTelemetry('call_connect_failure');
    endCall();
    // A connect failure can land AFTER CallKit already activated PlayAndRecord /
    // VoiceChat, so this path has to restore the normal mode exactly like the
    // clean disconnect does. It used not to, which left the whole app on the
    // receiver with the mic indicator lit until some later call ended cleanly.
    restoreNormalAudioModeAfterCall('connect_failure_restore');
    teardown();
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onDisconnected = (error?: any) => {
    // CAPTURE THE REAL DISCONNECT REASON. Twilio's Disconnected event passes an
    // error ONLY when the call dropped abnormally (undefined = a clean hangup by
    // either party). This was the blind spot behind "are we SURE it's Securus?":
    // without it, a clean Securus hangup and a media/RTP timeout (code 53405, a
    // network/audio-session failure) both logged the same generic string. Now the
    // code tells us: 31xxx = signaling, 53xxx = media/network, undefined = hangup.
    const disconnectCode = error?.code ?? null;
    const disconnectMessage = error?.message ?? null;
    const cleanHangup = error == null;
    if (callContextStash) {
      callContextStash.disconnectCode = disconnectCode;
      callContextStash.disconnectMessage = disconnectMessage;
      callContextStash.cleanHangup = cleanHangup;
    }
    analytics.capture(ANALYTICS_EVENTS.CALL.DISCONNECTED_REASON, {
      clean_hangup: cleanHangup,
      error_code: disconnectCode,
      error_message: disconnectMessage,
      call_sid:
        callContextStash?.callSid ?? useCallStore.getState().activeCall?.callSid ?? null,
    });
    // Final consolidated context BEFORE teardown clears the stash — captures the
    // end-state (audio category/route, app state) so a drop-at-connect vs a
    // clean-hangup is distinguishable, with the same full variable set.
    captureCallContext('disconnected');
    void captureCallStats('final');
    stopCallStatsCapture();
    activeCallObj = null;
    restoreInjectionDevice();
    void endCallTelemetry('call_disconnected');
    endCall();
    // Restore normal audio mode after the call ends.
    restoreNormalAudioModeAfterCall('disconnect_restore');
    teardown();
  };

  const onReconnecting = () => setCallState('reconnecting');
  const onReconnected = () => setCallState('connected');

  // SDK-detected quality warnings (high-jitter, high packet loss, low MOS, ...).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onQualityWarnings = (current: any, previous: any) => {
    const currentWarnings = Array.isArray(current) ? current : [];
    analytics.capture('call_quality_warning', {
      call_sid: useCallStore.getState().activeCall?.callSid ?? null,
      current_warnings: currentWarnings,
      previous_warnings: Array.isArray(previous) ? previous : [],
    });
    // Drive the "Weak signal" chip. Only the network-facing warnings count; a
    // constant-audio-input-level warning is about the mic, not the connection.
    const NETWORK_WARNINGS = ['high-jitter', 'high-packet-loss', 'high-rtt', 'low-mos'];
    const networkBad = currentWarnings.some((w: string) => NETWORK_WARNINGS.includes(w));
    if (networkBad) {
      if (qualityClearTimer) {
        clearTimeout(qualityClearTimer);
        qualityClearTimer = null;
      }
      useCallStore.getState().setNetworkWeak(true);
    } else {
      // Hold the chip ~4s after warnings clear so a flapping connection does not
      // strobe it on and off.
      if (qualityClearTimer) clearTimeout(qualityClearTimer);
      qualityClearTimer = setTimeout(() => {
        useCallStore.getState().setNetworkWeak(false);
        qualityClearTimer = null;
      }, 4000);
    }
  };

  const teardown = () => {
    if (removed) return;
    removed = true;
    if (qualityClearTimer) {
      clearTimeout(qualityClearTimer);
      qualityClearTimer = null;
    }
    try {
      call.off(Call.Event.Connected, onConnected);
    } catch {
      /* SDK may already have unbound */
    }
    try {
      call.off(Call.Event.ConnectFailure, onConnectFailure);
    } catch {
      /* noop */
    }
    try {
      call.off(Call.Event.Disconnected, onDisconnected);
    } catch {
      /* noop */
    }
    try {
      call.off(Call.Event.Reconnecting, onReconnecting);
    } catch {
      /* noop */
    }
    try {
      call.off(Call.Event.Reconnected, onReconnected);
    } catch {
      /* noop */
    }
    try {
      call.off(Call.Event.QualityWarningsChanged, onQualityWarnings);
    } catch {
      /* noop */
    }
    stopCallStatsCapture();
    telemetryCounters.dec('twilioListeners', 6);
    if (activeCallTeardown === teardown) activeCallTeardown = null;
  };

  // The call may ALREADY be connected by the time we get here: on the CallKit
  // answer branches the invite is accepted natively and Twilio raises Connected
  // before any of this is bound, so the listener above would never fire and
  // onConnected's whole body (stats capture, answer context, the session work)
  // would be skipped for the entire call. Read the SDK's own state and run it now
  // if so. The `connectedHandled` latch makes a later real Connected a no-op.
  try {
    if (typeof call.getState === 'function' && call.getState() === Call.State.Connected) {
      onConnected();
    }
  } catch {
    // Older SDK surface or a half-built Call object; the recovered-branch call to
    // beginConnectedCallTelemetry still covers the telemetry.
  }

  call.on(Call.Event.Connected, onConnected);
  call.on(Call.Event.ConnectFailure, onConnectFailure);
  call.on(Call.Event.Disconnected, onDisconnected);
  call.on(Call.Event.Reconnecting, onReconnecting);
  call.on(Call.Event.Reconnected, onReconnected);
  call.on(Call.Event.QualityWarningsChanged, onQualityWarnings);
  telemetryCounters.inc('twilioListeners', 6);

  // If a previous teardown was somehow still pending (stale call object),
  // run it now so we don't stack listeners across reconnect-then-rebind.
  if (activeCallTeardown) {
    try {
      activeCallTeardown();
    } catch {
      /* noop */
    }
  }
  activeCallTeardown = teardown;

  return teardown;
}

// ── AVAudioSession write instrumentation (`call_session_write`) ─────────────
// We poll the resulting route triple every 750ms (callTelemetry.watchAudioSession)
// but we have never recorded the WRITES themselves or their return values. That is
// why three independent analyses of the AirPods no-audio incident could neither
// confirm nor exclude the connect-time write storm: the writes were invisible and
// anything that happened between two polls was invisible with them. Every session
// mutation in this file now emits one ordered, attributable row with a before/after
// snapshot. Pure instrumentation: it never changes what a write does, and it must
// never throw into the call path.

/** `NativeCallAudioState | null` without re-declaring the native shape here. */
type LiveAudioState = Awaited<ReturnType<typeof getCallAudioState>>;

function sessionStateFields(
  prefix: 'before' | 'after' | 'observed',
  s: LiveAudioState
): Record<string, unknown> {
  // `liveCategoryOptions` is the RAW AVAudioSession category-option bitmask, and it
  // is the field that says whether a write silently dropped .allowBluetoothHFP or
  // added .defaultToSpeaker. It is optional on the native shape (older builds do
  // not report it), so it reports null rather than blocking the rest of the row.
  const options = s?.liveCategoryOptions ?? null;
  return {
    [`${prefix}_category`]: s?.liveCategory || null,
    [`${prefix}_mode`]: s?.liveMode || null,
    [`${prefix}_options`]: options,
    [`${prefix}_in_port`]: s?.liveInputPort || null,
    [`${prefix}_out_port`]: s?.liveOutputPort || null,
    [`${prefix}_rate`]: s && s.liveSampleRate > 0 ? s.liveSampleRate : null,
    // ATTRIBUTION, and the reason this event was added at all. Without these two
    // a row can prove that the output port changed across one of our writes but
    // not WHO changed it: an unchanged route_change_count across the write means
    // the move was ours, a count that advanced with reason=RouteConfigurationChange
    // means iOS completed a profile handoff while our write was in flight. They
    // arrive in the same native object the six fields above are read from, so
    // they cost nothing.
    [`${prefix}_route_reason`]: resolveRouteChangeReason(s),
    [`${prefix}_route_change_count`]: s?.routeChangeCount ?? null,
  };
}

function emitSessionWrite(payload: Record<string, unknown>): void {
  try {
    const ac = useCallStore.getState().activeCall;
    analytics.capture(ANALYTICS_EVENTS.CALL.SESSION_WRITE, {
      call_sid: ac?.callSid ?? null,
      call_state: ac?.state ?? null,
      // Which branch produced this row. The flag cohort is only readable here.
      connect_sequencing_enabled: isConnectSequencingEnabled(),
      ...payload,
    });
  } catch {
    // Telemetry must never break a call.
  }
}

/**
 * Run one AVAudioSession mutation with a before/after session snapshot around it.
 * `requested` is a short human-readable description of what we asked for (e.g.
 * `speaker=false`). Returns the raw write result so callers that need it (the
 * speaker toggle wants `liveOutputPort`) lose nothing by going through here.
 */
async function runSessionWrite<T>(
  writer: string,
  requested: string,
  write: () => Promise<T>,
  extra?: Record<string, unknown>
): Promise<{ ok: boolean | null; error: string | null; result: T | null }> {
  // THE PRE-WRITE SNAPSHOT MUST NOT DELAY THE WRITE.
  //
  // `await getCallAudioState()` before issuing the write put a full native
  // round-trip, resolved through the JS event loop, in front of every mutation —
  // including `connect_early_earpiece`, whose entire purpose is to land at t+0 so
  // the window where iOS routes a CallKit hasVideo=YES call to Speaker (the
  // client's echo) is as short as possible. On a VoIP-push cold launch this app has
  // measured jsLagPeakMs around 1.3 s in exactly that window, so the override would
  // have arrived up to a full lag spike late: instrumentation making the thing it
  // measures worse.
  //
  // Both are started in the SAME tick instead. getCallAudioState and
  // setSpeakerOutput are methods on the same native module (RNDeviceInfo), whose
  // calls run on one serial method queue in dispatch order, so for route overrides
  // the snapshot is genuinely taken first. For the expo-audio writes it races the
  // write by design, which is the correct trade: `after` is the authoritative
  // reading there anyway.
  const beforePromise = getCallAudioState();
  const startedAt = Date.now();
  let result: T | null = null;
  let ok: boolean | null = null;
  let error: string | null = null;
  try {
    result = await write();
    if (result === null) {
      // A native lever reporting itself unavailable (setSpeakerOutput off-iOS or
      // without the patched module), neither a success nor a failure. Left as
      // null so callers never treat "we could not even try" as "applied".
      ok = null;
    } else if (typeof result === 'object' && 'ok' in result) {
      // Natives that report their own outcome ({ok}) are authoritative.
      ok = (result as { ok: unknown }).ok === true;
    } else {
      // Plain void writes: resolving without throwing is the only success signal.
      ok = true;
    }
  } catch (err: unknown) {
    ok = false;
    error = err instanceof Error ? err.message : String(err);
  }
  const durationMs = Date.now() - startedAt;
  const [before, after] = await Promise.all([beforePromise, getCallAudioState()]);
  emitSessionWrite({
    writer,
    requested,
    ok,
    error,
    skipped: false,
    skip_reason: null,
    duration_ms: durationMs,
    ...sessionStateFields('before', before),
    ...sessionStateFields('after', after),
    ...extra,
  });
  return { ok, error, result };
}

/** Record a write we deliberately did NOT perform, with the state that decided it. */
function emitSessionWriteSkipped(
  writer: string,
  requested: string,
  skipReason: string,
  observed: LiveAudioState,
  extra?: Record<string, unknown>
): void {
  emitSessionWrite({
    writer,
    requested,
    ok: null,
    error: null,
    skipped: true,
    skip_reason: skipReason,
    duration_ms: 0,
    ...sessionStateFields('before', observed),
    ...sessionStateFields('after', observed),
    ...extra,
  });
}

/**
 * Put the audio session back to the app's normal mode after a call ENDS.
 *
 * Every terminal path has to do this, not just the clean one. `onDisconnected` was
 * the only caller, so a call killed by connect-failure, by an invite cancel, by a
 * reject, by an accept error or by an outbound connect throw left the app sitting
 * in Twilio's PlayAndRecord / VoiceChat session: every subsequent sound routes to
 * the receiver instead of the speaker and the orange microphone indicator stays
 * lit, with no recovery until some LATER call happens to end cleanly. Connect
 * failure in particular is a recurring event in this app.
 *
 * Guarded on the store rather than on any on-disk marker: `atto_audio_enabled` is
 * a persisted NSUserDefaults boolean written only by CallKit's didActivate /
 * didDeactivate, it survives process death, and providerDidReset does not clear
 * it — so it can be true with nothing live and must never be used to decide this.
 * Fire-and-forget; runSessionWrite swallows its own errors.
 */
function restoreNormalAudioModeAfterCall(writer: string): void {
  void (async () => {
    if (useCallStore.getState().activeCall !== null) {
      // Another call is somehow live (or this one has not been cleared yet).
      // .playback would strip its microphone, so record the decision and stop.
      emitSessionWriteSkipped(
        writer,
        'playsInSilentMode=true',
        'call_still_live',
        await getCallAudioState()
      );
      return;
    }
    await runSessionWrite(writer, 'playsInSilentMode=true', () =>
      setAudioModeAsync({ playsInSilentMode: true })
    );
  })();
}

/**
 * A session is "healthy for a call" when it is PlayAndRecord with a real input
 * port. That pair is the whole definition of "this call has a microphone", and it
 * is the condition reclaimAudioSession exists to restore. Anything we cannot read
 * (native unavailable, off-iOS, empty port string) counts as NOT healthy, so the
 * hijack recovery still runs when in doubt.
 */
function isSessionHealthyForCall(s: LiveAudioState): boolean {
  if (!s) return false;
  if (s.liveCategory !== 'AVAudioSessionCategoryPlayAndRecord') return false;
  const inPort = (s.liveInputPort || '').trim();
  if (!inPort) return false;
  const lowered = inPort.toLowerCase();
  return lowered !== 'none' && lowered !== 'unknown';
}

// ── Serialised connect-time session work (flag-gated) ──────────────────────
// Today setSpeakerOutput(false) fires at t+0 and ensureAudioRoute calls
// setSpeakerOutput AGAIN at t+700 from inside reclaimAudioSession, so we issue two
// to three overrideOutputAudioPort calls plus one setCategory inside a single
// second with no ordering guarantee. Telemetry says those writes were no-ops on the
// incident call, but they are genuinely unsequenced and were completely unlogged at
// the call site, which is why three analyses could neither rule them in nor out.
// One in-flight chain means every step observes the result of the previous one.
let sessionTaskChain: Promise<void> = Promise.resolve();

function queueSessionTask(task: () => Promise<void>): Promise<void> {
  // sessionTaskChain is always a settled-or-caught promise, so it never rejects
  // and a failing task can never stall everything queued behind it.
  const next = sessionTaskChain.then(task);
  sessionTaskChain = next.catch(() => {});
  return next;
}

// Preserved verbatim from the shipped behaviour: Twilio's own native session setup
// needs to settle before we re-assert PlayAndRecord.
const CONNECT_RECLAIM_DELAY_MS = 700;

/**
 * The connect-time audio work as ONE ordered task: early earpiece override, then
 * the 700ms reclaim, with the reclaim's duplicate route override dropped when the
 * early one already succeeded and the user's speaker intent has not changed since.
 * Policy is unchanged (same delay, same early-earpiece intent); only the ordering,
 * the logging and the one redundant override are different.
 */
async function runConnectSessionSequence(): Promise<void> {
  const wantSpeaker = useCallStore.getState().activeCall?.isSpeaker === true;
  let earlyOverrideOk = false;
  if (!wantSpeaker) {
    // Force earpiece IMMEDIATELY (not just at the 700ms reclaim) so the window
    // where iOS routes a "video" call to Speaker (the client's echo) is as short
    // as possible. No-op if the user chose speaker.
    const early = await runSessionWrite(
      'connect_early_earpiece',
      'speaker=false',
      () => setSpeakerOutput(false),
      { sequenced: true }
    );
    earlyOverrideOk = early.ok === true;
  }
  await wait(CONNECT_RECLAIM_DELAY_MS);
  // The user may have tapped speaker during the wait; that toggle already issued
  // its own override, so we must not fight it with a stale intent.
  const intentUnchanged =
    (useCallStore.getState().activeCall?.isSpeaker === true) === wantSpeaker;
  await reclaimAudioSession({ skipRouteOverride: earlyOverrideOk && intentUnchanged });
}

/**
 * Re-select the current audio device to force iOS to activate the VoIP audio session.
 * Called when a call first connects to ensure proper audio routing.
 *
 * `skipOverride` drops the route override entirely, used by the connect sequence
 * when the early earpiece override already succeeded and the user's intent has not
 * changed since, so we stop issuing two or three overrideOutputAudioPort calls
 * inside one second with no ordering guarantee.
 */
export async function ensureAudioRoute(opts?: { skipOverride?: boolean }) {
  try {
    // Force EARPIECE (Receiver) unless the user explicitly chose speaker. iOS
    // defaults VIDEO calls — and ours are CallKit hasVideo=YES for the lock-screen
    // auto-open — to SPEAKER. Speaker output + the built-in mic = the client's
    // "super echo" (call_context proved out_port=Speaker on those calls). The
    // native overrideOutputAudioPort:None removes any speaker override and lets
    // the natural route win (Bluetooth headset if present, else the receiver), so
    // it doesn't fight a real headset. Speaker=true keeps the user's choice.
    const userWantsSpeaker = useCallStore.getState().activeCall?.isSpeaker === true;
    if (opts?.skipOverride === true) {
      emitSessionWriteSkipped(
        'ensure_route_override',
        `speaker=${userWantsSpeaker}`,
        'already_applied_by_connect_sequence',
        await getCallAudioState()
      );
      return;
    }
    const { result: applied } = await runSessionWrite(
      'ensure_route_override',
      `speaker=${userWantsSpeaker}`,
      () => setSpeakerOutput(userWantsSpeaker),
      { user_wants_speaker: userWantsSpeaker }
    );
    // Only trust the native override when it actually SUCCEEDED (ok:true). At the
    // connect instant the session may not be active yet → overrideOutputAudioPort
    // returns {ok:false} (non-null); the old `!= null` check treated that as done
    // and skipped the fallback. Fall through to the Twilio device select on ok:false.
    if (applied?.ok === true) return;

    // Fallback (native unavailable OR override didn't take): re-select the device.
    const voice = voiceInstance;
    if (!voice) return;
    const { AudioDevice } = getTwilio();
    const { audioDevices, selectedDevice } = await voice.getAudioDevices();
    if (selectedDevice) {
      await runSessionWrite(
        'ensure_route_device_select',
        `device=selected:${selectedDevice.type ?? 'unknown'}`,
        () => selectedDevice.select(),
        {
          device_type: selectedDevice.type ?? null,
          device_name: selectedDevice.name ?? null,
          device_count: audioDevices?.length ?? 0,
          pick_reason: 'sdk_selected_device',
        }
      );
      return;
    }
    if (!audioDevices || audioDevices.length === 0) return;
    // Explicit TYPE match, never the positional audioDevices[0]: that index is
    // whatever order the SDK happened to return, so on a Bluetooth call it could
    // select the wrong endpoint and nothing about this branch was logged, so we
    // would never have known. toggleSpeaker already does the type-based lookup;
    // this path now matches it. When the user asked for speaker we honour that
    // first; otherwise a real headset wins over the built-in receiver, which is
    // the same precedence overrideOutputAudioPort:None produces natively.
    const byType = (t: unknown) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      audioDevices.find((d: any) => d.type === t) ?? null;
    const preferred = userWantsSpeaker
      ? (byType(AudioDevice.Type.Speaker) ?? byType(AudioDevice.Type.Bluetooth))
      : (byType(AudioDevice.Type.Bluetooth) ?? byType(AudioDevice.Type.Earpiece));
    const target = preferred ?? audioDevices[0];
    await runSessionWrite(
      'ensure_route_device_select',
      `device=${target?.type ?? 'unknown'}`,
      () => target.select(),
      {
        device_type: target?.type ?? null,
        device_name: target?.name ?? null,
        device_count: audioDevices.length,
        user_wants_speaker: userWantsSpeaker,
        pick_reason: preferred ? 'type_match' : 'no_type_match_first_available',
      }
    );
  } catch {
    // Best-effort — don't crash the call
  }
}

/**
 * Force Twilio to fully re-acquire the iOS audio session by doing a
 * brief hold/unhold cycle on the active call. This is the only reliable
 * way to restore VoIP audio after expo-audio steals the session.
 *
 * hold(true)  → Twilio releases the audio session entirely
 * hold(false) → Twilio re-acquires it with PlayAndRecord category
 */
export async function reclaimAudioSession(opts?: {
  skipRouteOverride?: boolean;
}): Promise<void> {
  // Safety net: re-apply PlayAndRecord + mixWithOthers and re-select device.
  // With keepAudioSessionActive: true on players, this should rarely be needed.
  try {
    console.log('[TwilioVoice] reclaimAudioSession: re-locking audio mode...');
    // Flag-gated: skip the category rewrite when the session is ALREADY what this
    // function exists to restore. expo-audio's setAudioMode takes the
    // .playAndRecord branch here and unconditionally inserts .allowBluetoothHFP,
    // .mixWithOthers and .defaultToSpeaker, applied through the two-argument
    // setCategory(category, options:) which does NOT carry Twilio's .voiceChat
    // mode. So on a healthy VoIP session we rewrite category, options and
    // possibly mode 700ms after answer for no reason at all.
    //
    // CONSERVATIVE BY CONSTRUCTION: this function is the shipped fix for the
    // expo-video Playback hijack (PR #34, b121). We skip ONLY when we can read
    // the live session AND it is PlayAndRecord AND the input port is real.
    // Unreadable state, a wrong category, a missing mic: all still rewrite. The
    // hijack recovery is never weakened.
    const guardEnabled = isConnectSequencingEnabled();
    const observed = guardEnabled ? await getCallAudioState() : null;
    const alreadyHealthy = guardEnabled && isSessionHealthyForCall(observed);
    if (alreadyHealthy) {
      emitSessionWriteSkipped(
        'reclaim_set_audio_mode',
        'playAndRecord+mixWithOthers',
        'session_already_playandrecord_with_input',
        observed
      );
    } else {
      await runSessionWrite(
        'reclaim_set_audio_mode',
        'playAndRecord+mixWithOthers',
        () =>
          setAudioModeAsync({
            playsInSilentMode: true,
            allowsRecording: true,
            interruptionMode: 'mixWithOthers',
          }),
        { guard_enabled: guardEnabled }
      );
    }
    await ensureAudioRoute({ skipOverride: opts?.skipRouteOverride === true });
    console.log('[TwilioVoice] reclaimAudioSession: done');
  } catch (err) {
    console.warn('[TwilioVoice] reclaimAudioSession failed:', err);
  }
}

/** Try to retrieve the active Call from the Voice SDK (e.g. after CallKit accepted). */
async function recoverCallFromSDK(): Promise<any | null> {
  try {
    const voice = getVoice();
    const calls = await voice.getCalls();
    if (calls.size > 0) {
      // getCalls() returns a Map<Uuid, Call>
      return calls.values().next().value ?? null;
    }
  } catch {
    // getCalls may not be available in all SDK versions
  }
  return null;
}

// One adoption per call, across every probe trigger (boot + foreground).
const adoptedColdCallSids = new Set<string>();

/**
 * COLD-CALL ADOPTION (build 146). On a cold launch, CallKit answers the call in
 * the NATIVE AttoVoipBootstrap before JS exists: the CallInvite event fired into
 * a dead process, so setIncomingCall never ran, the store's activeCall is null,
 * and the app renders as if there were no call at all — over a live, audible one
 * (David's b145 FASE 1A). The native side now hands the call into the module's
 * callMap at module init, so getCalls() CAN see it; this probe closes the last
 * gap by hydrating the JS state from that native truth.
 *
 * Called from the setup effect (boot) and on every foreground transition, and
 * deduped per callSid so a warm call or an already-adopted call is untouched.
 */
async function adoptNativeColdCall(trigger: string): Promise<void> {
  try {
    if (useCallStore.getState().activeCall) return; // JS already tracks a call
    const recovered = await recoverCallFromSDK();
    if (!recovered) return;
    const sid: string = recovered.getSid?.() || '';
    if (!sid || adoptedColdCallSids.has(sid)) return;
    adoptedColdCallSids.add(sid);
    const from: string = recovered.getFrom?.() || 'Unknown';
    let connectedAt: Date | null = null;
    try {
      const ts = recovered.getInitialConnectedTimestamp?.();
      if (ts) connectedAt = new Date(ts);
    } catch {
      // Older SDK surface; store falls back to "now".
    }
    activeCallObj = recovered;
    pendingInvite = null;
    // Creates the store's activeCall (state 'connected', direction 'inbound') —
    // this is what makes InCallTopBar render, DtmfKeypadHost auto-open (the
    // Securus press-1 path) and useConnectedCallLanding navigate.
    useCallStore.getState().setRecoveredCall(sid, from, connectedAt);
    bindCallEvents(recovered);
    // Session + telemetry, mirroring the recovered branches of acceptIncomingCall:
    // Connected fired natively long before JS existed, so nothing else starts these.
    reassertCallAudioSession();
    beginConnectedCallTelemetry('cold_adopted');
    reportCallAnswered('cold_adopted', { trigger });
    analytics.capture(ANALYTICS_EVENTS.CALL.COLD_CALL_ADOPTED, {
      trigger,
      call_sid: sid,
      call_type: classifyCallType(from),
      ms_since_js_start: Date.now() - MODULE_LOAD_MS,
    });
  } catch (error: unknown) {
    // The probe must never break app startup; the funnel markers still tell us
    // how far the native side got if this ever fails.
    analytics.capture(ANALYTICS_EVENTS.CALL.COLD_CALL_ADOPTED, {
      trigger,
      failed: true,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ── Standalone actions (importable from anywhere) ──

/**
 * Comprehensive "how was this call answered" telemetry — THE signal for the
 * mother-test "answered from background → dead audio both ways" failure. Fired
 * from every branch of acceptIncomingCall with the branch it took, the AppState
 * at answer time (background/inactive ⇒ answered from the lock screen / outside
 * the app), the engine-install state, and a LIVE AVAudioSession snapshot (async,
 * so it's fire-and-forget). See ANALYTICS_EVENTS.CALL.ANSWERED.
 */
/**
 * Persist the cold-launch CallKit EMERGENCY KILL-SWITCH to NSUserDefaults.
 *
 * The cold-launch crash protection is now ALWAYS ON by default in native code
 * (Aug 13): it must never depend on a flag or a prior launch, because the crash
 * it prevents is exactly what stops the app from launching to read a flag. So
 * this no longer ENABLES anything — it only writes an OPT-OUT that a kill flag
 * can set if the native path itself ever misbehaves on some device. Default: the
 * flag is off, we write `disabled = false`, protection stays on. Safe to call
 * repeatedly; iOS-only no-op elsewhere.
 */
export function persistColdLaunchCallKitFlag() {
  if (!IS_IOS) return;
  try {
    const disabled = analytics.isFeatureEnabled('coldlaunch_callkit_kill') === true;
    Settings.set({ atto_coldlaunch_callkit_disabled: disabled });
  } catch {
    // Settings is iOS-only / native module may be unavailable; ignore.
  }
}

/**
 * Persist the audio-injection cohort gate to NSUserDefaults so the NATIVE Twilio
 * module's -init can read it BEFORE it assigns TwilioVoiceSDK.audioDevice.
 *
 * WHY (build 80 diagnostic, recordCbCount=0): the module's lazy -init runs at
 * Twilio registration and UNCONDITIONALLY installed the STOCK audio device,
 * clobbering the custom injection engine that JS had installed at preinstall a
 * few seconds earlier. Incoming CallKit calls then bound to the stock device and
 * injected audio never reached the far party. With this flag on disk, -init
 * installs the CUSTOM engine itself (no swap, no clobber) — so it stays active
 * for every call, including CallKit-native-accepted ones (whose accept path skips
 * the JS re-install). Written at app launch AND on (re)registration so it's on
 * disk before -init; iOS-only no-op elsewhere. See project_injection_device_not_pumped.
 */
export function persistAudioInjectionFlag() {
  if (!IS_IOS) return;
  try {
    // The custom injection engine is a CREATOR feature. The PostHog flag is now
    // scoped to role=creator server-side, but gate on role here too so a future
    // flag widening can never install the custom audio device for a non-creator's
    // calls (role is available early from persisted auth; subscription is checked
    // separately at the inject ACTION in useCallAudioInjection).
    const flagOn = analytics.isFeatureEnabled('audio_injection_enabled') === true;
    const isCreator = useAuthStore.getState().user?.role === 'creator';
    Settings.set({ atto_audio_injection_enabled: flagOn && isCreator });
  } catch {
    // Settings is iOS-only / native module may be unavailable; ignore.
  }
}

/**
 * Persist the render-format-recheck cohort gate to NSUserDefaults, where
 * AttoAudioEngineDevice reads it as `atto_engine_render_format_recheck`.
 *
 * That device is the custom audio engine on the PLAYOUT half, and the three
 * behaviour changes it guards all live on code paths that run inside CallKit's
 * audio activation, long before PostHog can be asked anything. So the decision
 * has to already be on disk, exactly like the injection and cold-launch gates
 * above. Default NO: with the key absent the engine reproduces its shipped
 * behaviour byte for byte, and only the new counters move.
 *
 * The counters themselves are UNGATED, on purpose. `sessionRateFlipCount` and
 * `routeRebuildDisagreeCount` are what tell us whether the two defects are ever
 * hit in production, and we need that number from outside the cohort before the
 * correction is worth enabling anywhere. Roll the flag itself out on David (210)
 * only, and never on 152 / 153.
 */
export function persistEngineRenderFormatRecheckFlag() {
  if (!IS_IOS) return;
  try {
    const flagOn = analytics.isFeatureEnabled('engine_render_format_recheck') === true;
    // The engine is only ever installed for creators (persistAudioInjectionFlag),
    // so gate on role here too: nothing else can put this device in the path, and
    // a widened flag must not change behaviour for anyone whose calls run on
    // Twilio's stock audio device anyway.
    const isCreator = useAuthStore.getState().user?.role === 'creator';
    Settings.set({ atto_engine_render_format_recheck: flagOn && isCreator });
  } catch {
    // Settings is iOS-only / native module may be unavailable; ignore.
  }
}

/**
 * Emit the ONE consolidated `call_context` row — the "all variables" event David
 * asked for so a failed call self-reports every dimension instead of us
 * interrogating the user:
 *   · identity/routing: who called whom, app-to-app vs carrier/Securus, account
 *   · handoff: cold-launch vs warm, answered via native CallKit vs in-app, branch
 *   · app/lock state at invite / answer / connect (+ the push-time app state, the
 *     best "was the phone locked / app not open" proxy)
 *   · AUDIO GROUND TRUTH (captureCallAudioSnapshot): did the session activate,
 *     is it PlayAndRecord (mic) or Playback (mic-less), is Twilio's audio enabled
 *     — i.e. the direct signal for "there was no sound at all"
 * Fired at connect (audio settled) and at disconnect. Deduped per (sid, trigger).
 */
// AVAudioSession port names as iOS reports them (AVAudioSessionPortBluetoothA2DP =
// "BluetoothA2DPOutput", AVAudioSessionPortBluetoothHFP = "BluetoothHFP"). Matched
// by substring so a future LE/variant name still classifies correctly.
function isA2dpPort(port: string | null | undefined): boolean {
  return !!port && port.includes('BluetoothA2DP');
}

function isHfpPort(port: string | null | undefined): boolean {
  return !!port && port.includes('BluetoothHFP');
}

/**
 * Snapshot the live AVAudioSession at INVITE time into the call-context stash.
 * Async (native round-trip) and fire-and-forget: the invite path must never wait
 * on telemetry. Guarded on the call sid so a snapshot that resolves after the next
 * call has already started can never write into that newer call's stash.
 */
async function captureInviteAudioBaseline(callSid: string | null): Promise<void> {
  try {
    const s = await getCallAudioState();
    if (!s) return;
    const stash = callContextStash;
    if (!stash || stash.callSid !== callSid) return;
    stash.inviteAudioCategory = s.liveCategory || null;
    stash.inviteAudioMode = s.liveMode || null;
    stash.inviteInputPort = s.liveInputPort || null;
    stash.inviteOutputPort = s.liveOutputPort || null;
    stash.inviteSampleRate = s.liveSampleRate > 0 ? s.liveSampleRate : null;
    stash.inviteOtherAudioPlaying = s.liveOtherAudioPlaying ?? null;
  } catch {
    // Best-effort baseline.
  }
}

// How long after connect we take the "settled" sample. The Bluetooth A2DP → HFP
// profile switch does not complete at the connect instant, so a single sample at
// t+0 would report the switch as not-observed on every call that actually does it.
const ANSWER_CONTEXT_SETTLE_MS = 1500;

/**
 * ONE row per call describing the invite→answer audio transition, the established
 * trigger of the AirPods no-audio incident, as first-class fields instead of
 * something that has to be reconstructed by grouping raw 750ms ticks by call_sid.
 *
 * `answered_from_a2dp` is the trigger itself (the headset was a music sink when the
 * call arrived). `bt_profile_switch_observed` says whether iOS actually completed
 * the A2DP→HFP handoff we then depend on. Together they turn "how often does this
 * happen and what is its real failure rate" into a one-line cohort, which is the
 * only way to tell whether a future fix moved the number or whether we got lucky
 * against an ~11 percent base rate.
 */
function captureAnswerContext(): void {
  const s = callContextStash;
  const sid = s?.callSid ?? useCallStore.getState().activeCall?.callSid ?? null;
  const dedupeKey = `${sid ?? 'nosid'}:answer_context`;
  if (callContextEmitted.has(dedupeKey)) return;
  callContextEmitted.add(dedupeKey);

  const connectAtMs = Date.now();
  // Read every stash field NOW: the stash object is replaced (not mutated) by the
  // next call, but taking locals keeps this row internally consistent regardless.
  const inviteCategory = s?.inviteAudioCategory ?? null;
  const inviteMode = s?.inviteAudioMode ?? null;
  const inviteInPort = s?.inviteInputPort ?? null;
  const inviteOutPort = s?.inviteOutputPort ?? null;
  const inviteRate = s?.inviteSampleRate ?? null;
  const inviteOtherPlaying = s?.inviteOtherAudioPlaying ?? null;
  const inviteAtMs = s?.inviteAtMs ?? null;
  const answerAtMs = s?.answerAtMs ?? null;
  const direction = s?.direction ?? null;
  const answerBranch = s?.answerBranch ?? null;
  const appStateAtAnswer = s?.appStateAtAnswer ?? null;
  const callerFrom = s?.callerFrom ?? null;

  void (async () => {
    try {
      const atConnect = await getCallAudioState();
      await wait(ANSWER_CONTEXT_SETTLE_MS);
      const settled = await getCallAudioState();
      const answeredFromA2dp = isA2dpPort(inviteOutPort);
      analytics.capture(ANALYTICS_EVENTS.CALL.ANSWER_CONTEXT, {
        call_sid: sid,
        direction,
        call_type: classifyCallType(callerFrom),
        answer_branch: answerBranch,
        app_state_at_answer: appStateAtAnswer,
        // Which behaviour branch ran, so the cohort is separable in the same query.
        connect_sequencing_enabled: isConnectSequencingEnabled(),
        // Invite time: before anything of ours touched the session.
        invite_category: inviteCategory,
        invite_mode: inviteMode,
        invite_input_port: inviteInPort,
        invite_output_port: inviteOutPort,
        invite_sample_rate: inviteRate,
        invite_other_audio_playing: inviteOtherPlaying,
        // Connect instant.
        answer_category: atConnect?.liveCategory || null,
        answer_mode: atConnect?.liveMode || null,
        answer_input_port: atConnect?.liveInputPort || null,
        answer_output_port: atConnect?.liveOutputPort || null,
        answer_sample_rate:
          atConnect && atConnect.liveSampleRate > 0 ? atConnect.liveSampleRate : null,
        // After the route has had time to settle (profile switch, CallKit activation).
        settled_category: settled?.liveCategory || null,
        settled_input_port: settled?.liveInputPort || null,
        settled_output_port: settled?.liveOutputPort || null,
        settled_sample_rate:
          settled && settled.liveSampleRate > 0 ? settled.liveSampleRate : null,
        // Timing.
        ms_invite_to_answer:
          inviteAtMs != null && answerAtMs != null ? answerAtMs - inviteAtMs : null,
        ms_answer_to_connect: answerAtMs != null ? connectAtMs - answerAtMs : null,
        ms_connect_to_settled: Date.now() - connectAtMs,
        // The route changes that actually fired across the answer, individually,
        // from the native ring. This window is a burst (CategoryChange as Twilio
        // takes PlayAndRecord, OldDeviceUnavailable / NewDeviceAvailable /
        // RouteConfigurationChange as the AirPods leave A2DP for HFP, Override from
        // our own earpiece force) and a single last-wins reason field can only ever
        // name one of them. Read from the SETTLED snapshot so the whole burst is in
        // the ring by then.
        settled_recent_route_changes: formatRouteChangeRing(settled),
        settled_route_change_count: settled?.routeChangeCount ?? null,
        // THE trigger, and whether the handoff it forces actually happened.
        answered_from_a2dp: answeredFromA2dp,
        bt_profile_switch_observed:
          answeredFromA2dp &&
          (isHfpPort(atConnect?.liveOutputPort) || isHfpPort(settled?.liveOutputPort)),
      });
    } catch {
      // Telemetry must never break a connected call.
    }
  })();
}

function captureCallContext(trigger: 'connected' | 'disconnected') {
  const s = callContextStash;
  const sid = s?.callSid ?? useCallStore.getState().activeCall?.callSid ?? null;
  const dedupeKey = `${sid ?? 'nosid'}:${trigger}`;
  if (callContextEmitted.has(dedupeKey)) return;
  callContextEmitted.add(dedupeKey);
  if (callContextEmitted.size > 60) callContextEmitted.clear();

  const nowMs = Date.now();
  const appStateNow = AppState.currentState ?? 'unknown';
  // Cold launch: the invite arrived within the first ~15s of the process ⇒ the
  // call is what launched/woke the app (the "opened with iPhone first" case).
  const wasColdLaunch =
    s?.processUptimeAtInviteSec != null ? s.processUptimeAtInviteSec < 15 : null;

  void captureCallAudioSnapshot()
    .then((audio) => {
      analytics.capture(ANALYTICS_EVENTS.CALL.CONTEXT, {
        trigger,
        call_sid: sid,
        direction: s?.direction ?? null,
        local_account_id: s?.localAccountId ?? null,
        // Identity — the "who calls whom" David wants. from = raw caller address.
        caller_from: s?.callerFrom ?? null,
        callee_to: s?.calleeTo ?? null,
        call_type: classifyCallType(s?.callerFrom ?? null),
        target_user_id: s?.targetUserId ?? null,
        custom_param_keys: s?.customParamKeys ?? null,
        // Handoff / how it was answered.
        answer_branch: s?.answerBranch ?? null,
        answered_via_callkit:
          s?.answerBranch != null
            ? s.answerBranch !== 'fresh_accept' || s.appStateAtAnswer !== 'active'
            : null,
        was_cold_launch: wasColdLaunch,
        process_uptime_at_invite_sec: s?.processUptimeAtInviteSec ?? null,
        // App/lock state across the lifecycle. push-time app state (from audio
        // snapshot) is the best locked/not-open proxy; 0=active 1=inactive 2=bg.
        app_state_at_invite: s?.appStateAtInvite ?? null,
        app_state_at_answer: s?.appStateAtAnswer ?? null,
        app_state_at_connect: appStateNow,
        // Timing deltas (ms) — invite→answer→connect handoff latency.
        invite_to_answer_ms:
          s?.inviteAtMs != null && s?.answerAtMs != null
            ? s.answerAtMs - s.inviteAtMs
            : null,
        answer_to_connect_ms: s?.answerAtMs != null ? nowMs - s.answerAtMs : null,
        // Which audio device is bound (custom injection engine vs stock Twilio).
        engine_installed: injectionDeviceInstalled,
        engine_user: injectionDeviceUserId,
        // Real disconnect reason (only meaningful on the 'disconnected' row):
        // clean_hangup=true → someone hung up; a code → abnormal drop (53xxx
        // media/network, 31xxx signaling). This is what settles Securus-vs-app-vs-signal.
        disconnect_code: s?.disconnectCode ?? null,
        disconnect_message: s?.disconnectMessage ?? null,
        clean_hangup: s?.cleanHangup ?? null,
        // AUDIO GROUND TRUTH — the "no sound" prover.
        ...audio,
      });
    })
    .catch(() => {
      analytics.capture(ANALYTICS_EVENTS.CALL.CONTEXT, {
        trigger,
        call_sid: sid,
        direction: s?.direction ?? null,
        local_account_id: s?.localAccountId ?? null,
        caller_from: s?.callerFrom ?? null,
        call_type: classifyCallType(s?.callerFrom ?? null),
        answer_branch: s?.answerBranch ?? null,
        was_cold_launch: wasColdLaunch,
        app_state_at_connect: appStateNow,
        audio_snapshot_failed: true,
      });
    });
}

function reportCallAnswered(branch: string, extra?: Record<string, unknown>) {
  // Stash answer-time context for the consolidated call_context row.
  if (callContextStash) {
    callContextStash.answerBranch = branch;
    callContextStash.appStateAtAnswer = AppState.currentState ?? 'unknown';
    callContextStash.answerAtMs = Date.now();
  }
  const appStateAtAnswer = AppState.currentState ?? 'unknown';
  // The snapshot is async (native round-trip); don't block the accept path on it.
  void captureCallAudioSnapshot()
    .then((audio) => {
      analytics.capture(ANALYTICS_EVENTS.CALL.ANSWERED, {
        branch,
        // background / inactive here ⇒ the user answered via the native CallKit
        // UI while the app was NOT foregrounded — the exact case that breaks.
        app_state: appStateAtAnswer,
        answered_via_callkit: branch !== 'fresh_accept' || appStateAtAnswer !== 'active',
        engine_installed: injectionDeviceInstalled,
        engine_user: injectionDeviceUserId,
        call_sid: useCallStore.getState().activeCall?.callSid ?? null,
        ...audio,
        ...extra,
      });
    })
    .catch(() => {
      analytics.capture(ANALYTICS_EVENTS.CALL.ANSWERED, {
        branch,
        app_state: appStateAtAnswer,
        engine_installed: injectionDeviceInstalled,
        engine_user: injectionDeviceUserId,
        audio_snapshot_failed: true,
        ...extra,
      });
    });
}

export async function acceptIncomingCall() {
  analytics.capture(ANALYTICS_EVENTS.CALL.ACCEPTED);
  const invite = pendingInvite;
  const { setCallState, endCall } = useCallStore.getState();

  if (!invite) {
    // No invite — CallKit may have already consumed it.
    // Try to recover the Call object from the SDK.
    const recovered = await recoverCallFromSDK();
    if (recovered) {
      activeCallObj = recovered;
      pendingInvite = null;
      setCallState('connected');
      bindCallEvents(recovered);
      // CallKit accepted natively (no JS invite left) — the Connected event may
      // have already fired before bindCallEvents ran, so onConnected's
      // reclaimAudioSession never runs. Force it here so the session flips to
      // PlayAndRecord (mic) instead of a lingering Playback (mic-less) category.
      reassertCallAudioSession();
      // Connected already fired natively, so nothing would ever have started the
      // call telemetry, the WebRTC stats capture or the answer-context row on this
      // branch. Without them this call produces no call_quality_stats (so
      // "was their audio arriving?" is unanswerable), no call_answer_context and
      // no call_audio_session_changed rows at all. See beginConnectedCallTelemetry.
      beginConnectedCallTelemetry('callkit_recovered_no_invite');
      reportCallAnswered('recovered_no_invite');
    } else {
      endCall();
      restoreNormalAudioModeAfterCall('accept_no_call_restore');
      reportCallAnswered('no_invite_no_call');
    }
    return;
  }

  try {
    await installInjectionDeviceIfEnabled();
    const call = await invite.accept();
    activeCallObj = call;
    pendingInvite = null;
    setCallState('connected');
    bindCallEvents(call);
    reportCallAnswered('fresh_accept');
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);

    // CallKit already accepted — invite is in "accepted" state.
    // Recover the active Call object from the SDK.
    if (msg.includes('accepted')) {
      pendingInvite = null;
      const recovered = await recoverCallFromSDK();
      if (recovered) {
        activeCallObj = recovered;
        setCallState('connected');
        bindCallEvents(recovered);
        // Same as the no-invite branch: CallKit pre-accepted from the background,
        // so Connected likely fired before we bound onConnected. Reclaim the
        // PlayAndRecord session explicitly or the call stays mic-less both ways.
        reassertCallAudioSession();
        // Same as recovered_no_invite: Connected fired before we could bind, so
        // the stats capture and the answer-context row have to start from here.
        beginConnectedCallTelemetry('callkit_recovered_precepted');
        reportCallAnswered('recovered_precepted');
      } else {
        // No Call object available, but the call is live — transition anyway
        // so the UI doesn't stay stuck. Hangup/mute won't work until we get it.
        setCallState('connected');
        reassertCallAudioSession();
        // No Call object, so call_quality_stats cannot read anything yet — but the
        // session watcher and the answer-context row do not need one, and they are
        // the only record this branch would otherwise leave. The stats capture is
        // started too so it begins reporting the moment a Call object appears.
        beginConnectedCallTelemetry('callkit_accepted_no_call');
        reportCallAnswered('accepted_no_call');
      }
    } else {
      console.error('[TwilioVoice] acceptIncomingCall FAILED:', msg);
      endCall();
      restoreNormalAudioModeAfterCall('accept_error_restore');
      reportCallAnswered('accept_error', { error: msg });
    }
  }
}

/**
 * Re-assert the PlayAndRecord audio session on the CallKit/background-answer
 * path. When a call is answered from the native CallKit UI while the app is
 * backgrounded, Twilio's Call.Event.Connected can fire BEFORE our JS handler is
 * bound — so onConnected() (which schedules reclaimAudioSession) never runs, and
 * the session can stay stuck in the Playback (mic-less) category the feed's
 * expo-video left behind. Result: dead audio both ways (mother test). We reclaim
 * twice — immediately and after a short delay — because on a cold/background
 * answer Twilio's own native session activation (CallKit didActivateAudioSession)
 * may land a beat later and we want PlayAndRecord to win either way.
 */
function reassertCallAudioSession() {
  if (!IS_IOS) return;
  void reclaimAudioSession();
  setTimeout(() => {
    void reclaimAudioSession();
  }, 800);
}

export function rejectIncomingCall() {
  analytics.capture(ANALYTICS_EVENTS.CALL.REJECTED);
  void endCallTelemetry('rejected');
  if (pendingInvite) {
    try {
      pendingInvite.reject();
    } catch {
      /* SDK already torn down */
    }
    pendingInvite = null;
  }
  useCallStore.getState().endCall();
  // Same as every other terminal path: the ring may already have taken the call
  // session, and nothing else would ever put it back.
  restoreNormalAudioModeAfterCall('reject_restore');
}

// ── ATTO audio injection: device install/restore ───────────────────────────
// Swap in the custom AVAudioEngine injection device BEFORE a call connects (only
// when the feature flag is on — Twilio forbids swapping the device mid-call), and
// restore the stock device when the call ends. Flag OFF (default) => never called
// => the stock TVODefaultAudioDevice is untouched and base calls are byte-identical.
// Key mirrors AUDIO_INJECTION_FLAG in lib/callAudio/createAudioInjector.ts.
// Tracks whether we ACTUALLY swapped in the custom device this call. restore
// only runs when this is true — otherwise calling restoreDefaultDevice needlessly
// touches [AttoAudioEngineDevice sharedDevice], which inits the native engine on
// EVERY hang-up (the trigger for the AVFAudio crash, Sentry REACT-NATIVE-4C).
let injectionDeviceInstalled = false;
// The device install is PER-ACCOUNT, not global: switching accounts resets Twilio's
// active device, so a device installed for david.espejo did NOT carry over to
// westcol (PostHog: westcol's record_cb_count stayed 0). Track which user we
// installed for so each account re-installs, and re-assert on every call connect.
let injectionDeviceUserId: string | number | null = null;

export async function installInjectionDeviceIfEnabled(
  source: 'connect' | 'preinstall' = 'connect'
): Promise<void> {
  if (!IS_IOS) return;
  // Creator-only device install, mirroring persistAudioInjectionFlag. Flag is
  // scoped to role=creator server-side; the role re-check is defense in depth.
  const flagOn = analytics.isFeatureEnabled('audio_injection_enabled') === true;
  const isCreator = useAuthStore.getState().user?.role === 'creator';
  if (!flagOn || !isCreator) {
    // The flag was NOT readable/eligible at this moment. For INCOMING calls this
    // fired at accept before flags finished loading, so westcol never installed
    // the device and its engine stayed inert (Jun 30 telemetry). The preinstall
    // path (idle, reactive flag) is what actually makes it reliable; this just
    // records misses.
    analytics.capture(ANALYTICS_EVENTS.CALL.AUDIO_INJECT_DEVICE, {
      outcome: 'install_skipped_flag_off',
      source,
      flag_on: flagOn,
      is_creator: isCreator,
    });
    return;
  }
  const currentUserId = useAuthStore.getState().user?.id ?? null;
  // PER-ACCOUNT, not global: the 'preinstall' path (idle) skips only when the
  // device is already installed FOR THE CURRENT ACCOUNT — so switching to westcol
  // still installs even though david.espejo installed earlier. The 'connect' path
  // ALWAYS re-asserts (account switching resets Twilio's active device, so every
  // call must re-install for whoever is now active).
  if (
    source === 'preinstall' &&
    injectionDeviceInstalled &&
    injectionDeviceUserId === currentUserId
  ) {
    return;
  }
  const call_sid = useCallStore.getState().activeCall?.callSid ?? null;
  try {
    const ok = await NativeModules.AttoAudioInjection?.installInjectionDevice?.();
    injectionDeviceInstalled = ok === true;
    injectionDeviceUserId = ok === true ? currentUserId : null;
    // THE signal for the silent-injection bug: if this isn't 'installed' the
    // custom device isn't active and the remote will hear nothing injected.
    analytics.capture(ANALYTICS_EVENTS.CALL.AUDIO_INJECT_DEVICE, {
      outcome: ok ? 'installed' : 'install_returned_false',
      source,
      call_sid,
    });
  } catch (error: unknown) {
    injectionDeviceInstalled = false;
    analytics.capture(ANALYTICS_EVENTS.CALL.AUDIO_INJECT_DEVICE, {
      outcome: 'install_threw',
      reason: error instanceof Error ? error.message : String(error),
      source,
      call_sid,
    });
  }
}

function restoreInjectionDevice(): void {
  // The custom engine is validated NOT to break call audio, so we KEEP it
  // installed across calls rather than swapping the audio device back on every
  // hang-up. Twilio throws "WebRTC does not allow updating the audio device once
  // the media stack is created" when the device is swapped while the call is
  // tearing down (Sentry REACT-NATIVE-4E). Leaving the inert engine installed
  // avoids that crash entirely; the next call simply reuses it (re-install at
  // connect is a no-op since the device is already current).
  if (!IS_IOS || !injectionDeviceInstalled) return;
  analytics.capture(ANALYTICS_EVENTS.CALL.AUDIO_INJECT_DEVICE, {
    outcome: 'kept_installed',
  });
}

export function hangUpCall() {
  analytics.capture(ANALYTICS_EVENTS.CALL.ENDED);
  // Tactile + audible hang-up feedback (WhatsApp-style). The chime mixes over
  // the still-active session (mixWithOthers) and never seizes it — see callSounds.
  void haptic('heavy');
  playEndCallSound();
  void endCallTelemetry('hangup');
  // Force-detach any lingering listeners; the SDK's Disconnected event
  // *usually* runs the teardown, but we never want a stale Call object
  // holding closures across a reconnect failure.
  if (activeCallTeardown) {
    try {
      activeCallTeardown();
    } catch {
      /* noop */
    }
    activeCallTeardown = null;
  }
  if (activeCallObj) {
    try {
      activeCallObj.disconnect();
    } catch {
      /* noop */
    }
    activeCallObj = null;
  }
  // Restore the stock audio device in case the SDK skips Disconnected (idempotent).
  restoreInjectionDevice();
  useCallStore.getState().endCall();
}

export async function toggleMuteCall() {
  if (!activeCallObj) return;
  const isMuted = useCallStore.getState().activeCall?.isMuted ?? false;
  await activeCallObj.mute(!isMuted);
  useCallStore.getState().setMuted(!isMuted);
  analytics.capture(ANALYTICS_EVENTS.CALL.MUTE_TOGGLED, { is_muted: !isMuted });
}

export async function toggleHoldCall() {
  if (!activeCallObj) return;
  const isOnHold = useCallStore.getState().activeCall?.isOnHold ?? false;
  await activeCallObj.hold(!isOnHold);
  useCallStore.getState().setOnHold(!isOnHold);
}

/**
 * Send DTMF touch-tones on the active call (e.g. press "1" to accept a
 * Securus/prison-carrier inmate call after its IVR prompt).
 *
 * This is the ONLY place that touches the Twilio Call object for DTMF —
 * every UI surface depends on this function, never on `activeCallObj`.
 * Hardened so it never throws to the UI: it returns whether the digits
 * were actually sent.
 *
 * @param digits A string of DTMF characters (`0-9`, `*`, `#`, or `w` for a
 *   500ms pause). `sendDigits('01')` sends `0` then `1`.
 * @returns `true` only when the SDK confirms the tones were sent.
 */
export async function sendCallDigits(digits: string): Promise<boolean> {
  // Full context snapshot at the instant of the attempt, so EVERY exit path
  // (incl. the silent drops) lands a queryable event with the exact reason.
  const ac = useCallStore.getState().activeCall;
  const state = ac?.state ?? null;
  const connectedAtMs = ac?.connectedAt ? new Date(ac.connectedAt).getTime() : null;
  const ctx = {
    digits,
    call_state: state,
    has_call_obj: activeCallObj != null,
    call_sid: ac?.callSid ?? null,
    direction: ac?.direction ?? null,
    is_muted: ac?.isMuted ?? null,
    is_on_hold: ac?.isOnHold ?? null,
    is_speaker: ac?.isSpeaker ?? null,
    // How long after the call CONNECTED the digit was sent — the key Securus
    // signal: digits pressed before the IVR prompt finishes get ignored.
    since_connected_ms: connectedAtMs != null ? Date.now() - connectedAtMs : null,
    was_sending: isSendingDigits,
  };
  const report = (outcome: string, extra?: Record<string, unknown>) =>
    analytics.capture(ANALYTICS_EVENTS.CALL.DTMF_ATTEMPT, { ...ctx, outcome, ...extra });

  // (1) No live SDK call object — the JS store can say "connected" while the
  // native call was lost (cold-launch/recovery races). Previously a silent drop.
  if (!activeCallObj) {
    report('no_active_call');
    return false;
  }

  // (2) Tones are only meaningful on a connected media path. Pre-connect and
  // `reconnecting` sends are dropped. Previously a silent drop — the most
  // likely Securus failure (user taps "1" before the call is 'connected').
  if (state !== 'connected') {
    report('not_connected');
    return false;
  }

  // (3) Validate against the SDK's accepted character set before crossing the
  // native bridge. A malformed value can only come from a programming error.
  if (!/^[0-9*#w]+$/.test(digits)) {
    report('invalid');
    Sentry.captureException(new Error(`Invalid DTMF digits: ${digits}`), {
      tags: { feature: 'twilio-voice', step: 'send-digits-invalid' },
    });
    return false;
  }

  // (4) One sendDigits() in flight at a time — a double-tap is dropped.
  // Previously silent.
  if (isSendingDigits) {
    report('busy');
    return false;
  }

  isSendingDigits = true;
  const startedAt = Date.now();
  try {
    await activeCallObj.sendDigits(digits);
    const latency = Date.now() - startedAt;
    report('sent', { send_latency_ms: latency });
    analytics.capture(ANALYTICS_EVENTS.CALL.DTMF_SENT, {
      digits,
      send_latency_ms: latency,
      // Join key. Was MISSING (Aug 14): call_dtmf_sent rows could not be joined
      // to their call, so a per-call "was the 1 delivered?" query silently
      // returned zero and misdiagnosed working calls as no-DTMF drops.
      call_sid: useCallStore.getState().activeCall?.callSid ?? null,
    });
    return true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    report('sdk_error', { send_latency_ms: Date.now() - startedAt, error: message });
    Sentry.captureException(err, {
      tags: { feature: 'twilio-voice', step: 'send-digits' },
      extra: { ...ctx, error: message },
    });
    analytics.capture(ANALYTICS_EVENTS.CALL.DTMF_SEND_FAILED, { error: message });
    return false;
  } finally {
    isSendingDigits = false;
  }
}

/** Convenience wrapper for sending a single keypad digit. */
export const sendCallDigit = (digit: string): Promise<boolean> => sendCallDigits(digit);

export async function toggleSpeaker() {
  // Reentrancy guard: repeated audio-route changes during a call were the
  // last action recorded before WatchdogTermination on 2/7 PostHog sessions.
  if (isSpeakerToggling) return;
  isSpeakerToggling = true;

  // Target = the OPPOSITE of the current UI speaker state (a plain on/off toggle).
  const currentlySpeaker = useCallStore.getState().activeCall?.isSpeaker === true;
  const wantSpeaker = !currentlySpeaker;

  // Telemetry is UNCONDITIONAL now (was gated on isActive, so a toggle before the
  // telemetry session started emitted nothing — which is exactly why the client's
  // "couldn't turn speaker on" left ZERO events to diagnose). Always report.
  const finish = (extra: Record<string, unknown>) => {
    isSpeakerToggling = false;
    analytics.capture(ANALYTICS_EVENTS.CALL.SPEAKER_TOGGLED, {
      want_speaker: wantSpeaker,
      ...extra,
    });
  };

  try {
    // ROUTE PICKER branch (b151). With a Bluetooth device connected there are 3+
    // possible outputs and a binary override just FIGHTS iOS: telemetry showed
    // the Override to Speaker snapped back to BluetoothHFP in under a second
    // (David, AirPods test). Present the SYSTEM route picker instead
    // (AVRoutePickerView) — native-layer presentation, immune to the JS
    // sheet-stacking that killed the old ActionSheet picker in b98. Detection is
    // the same rule the old picker used: Twilio's device list has >2 entries
    // only when an external (Bluetooth) route exists. Every failure falls
    // through to the direct toggle — a tap is never a no-op.
    if (Platform.OS === 'ios') {
      try {
        const voice = voiceInstance;
        const { audioDevices } = voice
          ? await voice.getAudioDevices()
          : { audioDevices: null };
        if (audioDevices && audioDevices.length > 2) {
          const shown = await showAudioRoutePicker();
          if (shown?.ok) {
            finish({
              outcome: 'picker_shown',
              device_count: audioDevices.length,
            });
            return;
          }
          // Native picker unavailable (no_button_subview on a future iOS, etc.)
          // → record it and fall through to the direct toggle.
          analytics.capture(ANALYTICS_EVENTS.CALL.SPEAKER_TOGGLED, {
            want_speaker: wantSpeaker,
            outcome: 'picker_fallback',
            picker_reason: shown?.reason ?? 'unavailable',
            device_count: audioDevices.length,
          });
        }
      } catch {
        /* device enumeration failed — the direct toggle below still works */
      }
    }

    // Record the user's choice in the store FIRST, before any await. The connect
    // reclaim (ensureAudioRoute) reads activeCall.isSpeaker to decide whether to
    // force earpiece; if we set it only AFTER the native+Twilio awaits (~50-200ms),
    // a reclaim firing in that window would read the stale value and REVERT a
    // just-pressed speaker toggle back to earpiece. Set it up front so reclaim
    // always sees the intended route.
    useCallStore.getState().setSpeaker(wantSpeaker);

    // PRIMARY, RELIABLE lever: AVAudioSession.overrideOutputAudioPort via the
    // patched native module. This is the documented CallKit speaker control and
    // works regardless of which audio device (stock vs custom engine) is bound,
    // and — crucially — needs NO ActionSheet, so it can't be blocked by the
    // recording screen's bottom sheets (the client's "no matter what I did").
    const { result: nativeResult } = await runSessionWrite(
      'speaker_toggle',
      `speaker=${wantSpeaker}`,
      () => setSpeakerOutput(wantSpeaker),
      { user_initiated: true }
    );

    // Belt-and-suspenders: also tell Twilio's AudioDevice so its notion of the
    // selected route stays in sync (harmless if it no-ops). Best-effort.
    let twilioSelected = false;
    try {
      const voice = voiceInstance;
      if (voice) {
        const { AudioDevice } = getTwilio();
        const { audioDevices } = await voice.getAudioDevices();
        const target = audioDevices?.find(
          (d: any) =>
            d.type ===
            (wantSpeaker ? AudioDevice.Type.Speaker : AudioDevice.Type.Earpiece)
        );
        if (target) {
          await target.select();
          twilioSelected = true;
        }
      }
    } catch {
      /* Twilio route sync is best-effort; the native override is authoritative. */
    }

    // isSpeaker was already set optimistically above (before the awaits).
    const applied = nativeResult ? nativeResult.ok : true;
    finish({
      outcome: 'applied',
      is_speaker: wantSpeaker,
      native_ok: nativeResult?.ok ?? null,
      native_available: nativeResult != null,
      live_output_port: nativeResult?.liveOutputPort ?? null,
      twilio_selected: twilioSelected,
      applied,
    });
  } catch (err) {
    finish({
      outcome: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Snapshot the microphone grant at the moment a call connects. A call can
// connect through CallKit with NO mic access (iOS only prompts lazily) — the
// caller then can't hear the user. This lets us measure how often that happens
// and alert on it. Fire-and-forget; telemetry must never break the call.
async function captureCallMicPermission(phase: string) {
  try {
    const p = await AudioModule.getRecordingPermissionsAsync();
    analytics.capture(ANALYTICS_EVENTS.CALL.MIC_PERMISSION_STATUS, {
      phase,
      status: p.status,
      granted: p.granted,
      can_ask_again: p.canAskAgain,
    });
    if (!p.granted) {
      Sentry.captureMessage('Call connected without microphone permission', {
        level: 'warning',
        tags: { feature: 'twilio-voice', step: phase },
      });
    }
  } catch {
    /* non-fatal telemetry */
  }
}

// ── Outgoing VoIP call ──

export async function makeVoIPCall(recipientUserId: string, recipientName?: string) {
  const { setOutgoingCall, endCall } = useCallStore.getState();

  if (activeCallObj) {
    console.warn('[TwilioVoice] Already in a call');
    return;
  }

  // Start telemetry as soon as we commit to placing a call; the pre-connect
  // token fetch + voice.connect window has already produced 2/7 of the
  // crashes (outgoing_initiated → silence). We want snapshots for that
  // window too.
  await startCallTelemetry('outgoing_initiated');

  try {
    const { token } = await telephonyService.getVoiceToken();
    const voice = getVoice();

    // contactHandle is what iOS Phone app shows in Recents for OUTGOING
    // calls (the SDK falls back to the literal "Default Contact" string
    // when omitted). Prefer the recipient's username, fall back to the
    // numeric identity so we never end up with "Default Contact" again.
    const contactHandle = recipientName ? `@${recipientName}` : `user-${recipientUserId}`;

    await installInjectionDeviceIfEnabled();
    const call = await voice.connect(token, {
      contactHandle,
      params: {
        To: `user-${recipientUserId}`,
        recipientType: 'client',
      },
    });

    activeCallObj = call;

    const callSid = call.getSid() || `outgoing-${Date.now()}`;
    setOutgoingCall(callSid, recipientUserId, recipientName);
    // Consolidated call_context stash (outbound). Outbound is app-initiated and
    // always foreground, so there's no cold-launch/CallKit-handoff ambiguity —
    // but we still want the identity + audio-ground-truth row for parity.
    callContextEmitted.clear();
    callContextStash = {
      callSid,
      direction: 'outbound',
      localAccountId: useAccountStore.getState().activeAccountId ?? null,
      callerFrom: null,
      calleeTo: `user-${recipientUserId}`,
      targetUserId: Number.isFinite(Number(recipientUserId))
        ? Number(recipientUserId)
        : null,
      customParamKeys: 'To,recipientType',
      appStateAtInvite: AppState.currentState ?? 'unknown',
      inviteAtMs: Date.now(),
      processUptimeAtInviteSec: Math.max(
        0,
        Math.floor((Date.now() - MODULE_LOAD_MS) / 1000)
      ),
      answerBranch: 'outbound_connect',
      appStateAtAnswer: AppState.currentState ?? 'unknown',
      answerAtMs: Date.now(),
      disconnectCode: null,
      disconnectMessage: null,
      cleanHangup: null,
      inviteAudioCategory: null,
      inviteAudioMode: null,
      inviteInputPort: null,
      inviteOutputPort: null,
      inviteSampleRate: null,
      inviteOtherAudioPlaying: null,
    };
    // Pre-call audio baseline for call_answer_context (outbound parity: the same
    // A2DP-media-sink trigger applies when the user places a call while listening).
    void captureInviteAudioBaseline(callSid);
    bindCallEvents(call);
    router.push('/call');

    analytics.capture(ANALYTICS_EVENTS.CALL.OUTGOING_INITIATED, {
      recipient_user_id: recipientUserId,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[TwilioVoice] makeVoIPCall FAILED:', msg);
    Sentry.captureException(error, {
      tags: { feature: 'twilio-voice', step: 'outgoing-connect' },
    });
    void endCallTelemetry('outgoing_connect_failed');
    endCall();
    // voice.connect() can throw after Twilio has already taken the session, so the
    // failed outbound path needs the same restore as every other terminal path.
    restoreNormalAudioModeAfterCall('outgoing_failed_restore');
  }
}

// ── Hook (only called once in _layout.tsx) ──

export function useTwilioVoice() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  // Selector — NOT an imperative subscribe(). Driving the registration
  // effect off the active account ID lets React serialize the rerun
  // AFTER accountStore.switchToAccount finishes Phase A (resumeRequests
  // included). subscribe() would fire mid-Phase-A and the token fetch
  // would hang in the paused queue.
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const setRegistered = useCallStore((s) => s.setRegistered);
  const setIncomingCall = useCallStore((s) => s.setIncomingCall);
  const endCall = useCallStore((s) => s.endCall);

  // Only set the Playback audio mode when there's NO call.
  // During a call, let Twilio manage its own PlayAndRecord session.
  // Our setAudioModeAsync calls were interfering with Twilio's setup,
  // causing 30-60s audio delays on connect.
  const hasAnyCall = useCallStore((s) => s.activeCall !== null);

  useEffect(() => {
    if (hasAnyCall) return;
    // This used to be a bare, un-awaited setAudioModeAsync, the only one in this
    // file without a catch (the disconnect restore and reclaimAudioSession are both
    // guarded). It resolves to category .playback, which STRIPS the microphone, and
    // it fires on the hasAnyCall→false transition, which can race a session that is
    // still live during teardown. That race is the proven source of Sentry issue
    // 7502347202 (OSStatus 561017449, AVAudioSessionErrorInsufficientPriority):
    // every real event is tagged mechanism=onunhandledrejection and the 2026-07-15
    // event's final breadcrumb is the console.log immediately above this call.
    console.log('[TwilioVoice] Setting audio mode: Playback (no call)');
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const attempt = async (n: number): Promise<void> => {
      const live = await getCallAudioState();
      if (cancelled) return;
      // Re-check the store after the native round-trip: a call can have started
      // again in that window.
      const callLive = useCallStore.getState().activeCall !== null;
      // DELIBERATELY NOT `live?.twilioAudioEnabled`. That reads the persisted
      // NSUserDefaults boolean `atto_audio_enabled`, written only by CallKit's
      // didActivate / didDeactivate. It survives process death and
      // providerDidReset does not clear it, so after a call is killed mid-flight
      // (the documented OOM / watchdog path) it stays true on disk forever. Using
      // it here meant playsInSilentMode was never set again for the whole next
      // session: every feed video, audio message and preview silent for anyone
      // with the ring switch on. A sticky on-disk marker can never prove that a
      // session is currently owned.
      const captureSessionLive = isSessionHealthyForCall(live);
      if (callLive || captureSessionLive) {
        // Do NOT force .playback onto a session that still has a live capture
        // path. Either a call is coming back up, or something else in the app
        // owns a recording session, and taking its microphone away is exactly
        // the failure mode we are trying to stop causing.
        //
        // But a skip cannot be the end of it. This effect only re-runs on a
        // hasAnyCall transition, and this is the ONLY global setter of
        // playsInSilentMode in the app, so a single skip would strand the whole
        // session. Retry instead: fast at first, then slowly, for as long as the
        // effect stays mounted, so the write lands the moment the session is
        // genuinely free. Only the first few skips are reported, so a long
        // recording cannot flood the event stream.
        if (n <= NO_CALL_RESTORE_REPORTED_ATTEMPTS) {
          emitSessionWriteSkipped(
            'no_call_effect',
            'playsInSilentMode=true',
            callLive ? 'call_still_live' : 'live_capture_session',
            live,
            { attempt: n, will_retry: true }
          );
        }
        retryTimer = setTimeout(
          () => {
            void attempt(n + 1);
          },
          n < NO_CALL_RESTORE_FAST_ATTEMPTS
            ? NO_CALL_RESTORE_FAST_MS
            : NO_CALL_RESTORE_SLOW_MS
        );
        return;
      }
      await runSessionWrite(
        'no_call_effect',
        'playsInSilentMode=true',
        () => setAudioModeAsync({ playsInSilentMode: true }),
        { attempt: n }
      );
    };

    void attempt(1);
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [hasAnyCall]);

  const registerDevice = useCallback(
    async (forAccountId: number | null) => {
      if (!IS_IOS) return; // Twilio Voice not configured for Android yet
      if (!pushKitReady) return;
      if (!useAuthStore.getState().isAuthenticated) return;
      if (forAccountId == null) return;

      // Claim a generation slot. Anything older than this is now stale —
      // in-flight retries from a previous call will see their captured `gen`
      // != currentRegistrationGen and short-circuit.
      const gen = ++currentRegistrationGen;

      // Backoff schedule: 1s → 3s → 10s. Total 4 attempts before giving up.
      // Without retry, a single transient network blip during a switch
      // bricks Voice for the rest of the session.
      const RETRY_DELAYS_MS = [1000, 3000, 10000];
      let lastError: unknown = null;

      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        if (gen !== currentRegistrationGen) return;
        try {
          const { token } = await telephonyService.getVoiceToken();
          if (gen !== currentRegistrationGen) return;
          const voice = getVoice();
          await voice.register(token);
          if (gen !== currentRegistrationGen) {
            // Raced — a newer switch happened while we were registering.
            // Undo our binding so the newer attempt's identity wins clean.
            try {
              await voice.unregister(token);
            } catch {
              /* noop — server-side rebinding will fix it */
            }
            return;
          }
          lastToken = token;
          activeIdentityAccountId = forAccountId;
          setRegistered(true);
          analytics.capture(ANALYTICS_EVENTS.CALL.TWILIO_REGISTERED, {
            account_id: forAccountId,
            attempt: attempt + 1,
          });
          return;
        } catch (error: unknown) {
          lastError = error;
          if (gen !== currentRegistrationGen) return;
          if (attempt < RETRY_DELAYS_MS.length) {
            await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
          }
        }
      }

      // All attempts exhausted. The SDK is now unregistered for this
      // account — the next switch, login, or 50-minute token refresh
      // will retry from scratch.
      if (gen !== currentRegistrationGen) return;
      const message =
        lastError instanceof Error ? lastError.message : 'Voice registration failed';
      console.error('[TwilioVoice] Registration FAILED after retries:', message);
      Sentry.captureException(lastError, {
        tags: { feature: 'twilio-voice', step: 'register' },
        extra: {
          account_id: forAccountId,
          total_attempts: RETRY_DELAYS_MS.length + 1,
        },
      });
      analytics.capture(ANALYTICS_EVENTS.CALL.TWILIO_REGISTRATION_FAILED, {
        account_id: forAccountId,
        error_message: message,
        total_attempts: RETRY_DELAYS_MS.length + 1,
      });
      setRegistered(false, message);
    },
    [setRegistered]
  );

  useEffect(() => {
    // Skip Twilio Voice setup entirely on Android — Firebase (google-services.json)
    // is not configured yet, and the native module crashes without it.
    if (!isAuthenticated || !IS_IOS) return;
    // Wait for the account store to hydrate before registering — without an
    // accountId we can't tag identity ownership, and the effect will rerun
    // automatically once activeAccountId is set.
    if (activeAccountId == null) return;

    const { Voice, CallInvite } = getTwilio();
    const voice = getVoice();

    const onCallInvite = async (invite: any) => {
      // Stamp the raw arrival FIRST — before any auto-switch round-trip — so we
      // know exactly when (and whether) the invite reached JS. On a cold launch
      // from a killed app this either lands far later than the native push
      // marker or never fires at all; that delta is the "rang late" signal.
      analytics.capture(ANALYTICS_EVENTS.CALL.INCOMING_RAW, {
        app_state: AppState.currentState,
        active_account_id: activeAccountId,
      });

      // ── Auto-switch to the target account if needed (multi-account fan-out)
      // The telephony-service webhook emits `<Parameter name="TargetUserId">`
      // alongside each `<Client>` to tell us which logical account this call
      // is for. With multi-account fan-out, the call may be delivered to the
      // currently-registered Voice SDK identity even though it's intended
      // for a different linked account on this device — in that case we
      // silently switch BEFORE showing CallKit / setIncomingCall so all
      // post-accept context (queries, screens, audio attribution) belongs to
      // the right account.
      //
      // Wrapped in a try block: any crash here must not break the rest of
      // the invite flow — we'd rather ring on the wrong account than miss
      // the call entirely.
      try {
        const params =
          typeof invite.getCustomParameters === 'function'
            ? (invite.getCustomParameters() as Record<string, string>)
            : ({} as Record<string, string>);
        const targetUserId = Number(params?.TargetUserId);

        if (Number.isFinite(targetUserId) && targetUserId > 0) {
          const accountState = useAccountStore.getState();
          const callState = useCallStore.getState();
          const isLinked = accountState.accounts.some(
            (a) => Number(a.user.id) === targetUserId
          );

          if (!isLinked) {
            // Defense: backend claims this device should handle a target
            // it's not linked to. Don't switch — ring on current account.
            analytics.capture(ANALYTICS_EVENTS.CALL.INVITE_TARGET_NOT_LINKED, {
              target_user_id: targetUserId,
            });
          } else if (
            accountState.activeAccountId !== targetUserId &&
            callState.activeCall == null
          ) {
            // Linked + not active + no other call in progress → auto-switch.
            analytics.capture(ANALYTICS_EVENTS.CALL.INVITE_AUTO_SWITCH_STARTED, {
              from_account_id: accountState.activeAccountId,
              to_account_id: targetUserId,
            });
            try {
              await accountState.switchToAccountForIncomingCall(targetUserId);
              analytics.capture(ANALYTICS_EVENTS.CALL.INVITE_AUTO_SWITCH_SUCCEEDED, {
                account_id: targetUserId,
              });
            } catch (switchErr) {
              // Switch failed (network down, token rejected, target not
              // linked). DisplayName from TwiML still resolves correctly,
              // so the call rings on the current account with the right
              // caller info — degraded but not dropped.
              analytics.capture(ANALYTICS_EVENTS.CALL.INVITE_AUTO_SWITCH_FAILED, {
                from_account_id: accountState.activeAccountId,
                to_account_id: targetUserId,
                error_message:
                  switchErr instanceof Error ? switchErr.message : String(switchErr),
              });
              Sentry.captureException(switchErr, {
                tags: { feature: 'twilio-voice', step: 'auto-switch' },
                extra: { target_user_id: targetUserId },
              });
            }
          }
        }
      } catch (paramErr) {
        // Custom-parameter parsing failed — log and proceed. Falls back to
        // the legacy single-account flow (works for users with no linkage).
        Sentry.captureException(paramErr, {
          tags: { feature: 'twilio-voice', step: 'auto-switch-defense' },
        });
      }

      pendingInvite = invite;

      const callSid = invite.getCallSid();
      const from = invite.getFrom() || 'Unknown';

      // ── Consolidated call_context stash (inbound) ──
      // Snapshot every identity/routing/launch variable at the earliest moment
      // so the connect/disconnect call_context row is complete even on a messy
      // CallKit handoff. Guarded — telemetry must never break the invite flow.
      try {
        const ctxParams =
          typeof invite.getCustomParameters === 'function'
            ? (invite.getCustomParameters() as Record<string, string>)
            : {};
        const to = typeof invite.getTo === 'function' ? invite.getTo() : null;
        callContextEmitted.clear();
        callContextStash = {
          callSid,
          direction: 'inbound',
          localAccountId: activeAccountId ?? null,
          callerFrom: from,
          calleeTo: to || null,
          targetUserId: Number.isFinite(Number(ctxParams?.TargetUserId))
            ? Number(ctxParams.TargetUserId)
            : null,
          customParamKeys: Object.keys(ctxParams || {}).join(',') || null,
          appStateAtInvite: AppState.currentState ?? 'unknown',
          inviteAtMs: Date.now(),
          processUptimeAtInviteSec: Math.max(
            0,
            Math.floor((Date.now() - MODULE_LOAD_MS) / 1000)
          ),
          answerBranch: null,
          appStateAtAnswer: null,
          answerAtMs: null,
          disconnectCode: null,
          disconnectMessage: null,
          cleanHangup: null,
          inviteAudioCategory: null,
          inviteAudioMode: null,
          inviteInputPort: null,
          inviteOutputPort: null,
          inviteSampleRate: null,
          inviteOtherAudioPlaying: null,
        };
        // Snapshot the session BEFORE we (or CallKit) touch it. This is the one
        // sample that says whether the headset was already playing media when the
        // call arrived, the established trigger of the no-audio incident.
        void captureInviteAudioBaseline(callSid);
      } catch {
        /* telemetry stash is best-effort */
      }

      // ── PRIMARY watchdog-leak fix (REACT-NATIVE-8) ──
      // Previously these two listeners were registered with anonymous
      // arrow functions and never removed. Every incoming call (accepted,
      // rejected, missed, cancelled) accumulated 2 listeners + their
      // closures over `endCall`/`setCallState`/`activeCallObj`, retaining
      // the entire invite object forever. Over a session with several
      // rings, this pushes the process above iOS's per-app RAM cap and
      // the watchdog kills the app.
      //
      // Now: named handlers, mutual `detach()` in both terminal events,
      // and an explicit counter so the leak is detectable in telemetry.
      let inviteHandlersAttached = false;
      // Option A (CallKit-is-the-single-ring-surface): when an incoming call
      // arrives in the FOREGROUND, CallKit's banner already rings — so we
      // suppress our own full-screen IncomingCallScreen to kill the double-ring
      // redundancy, and navigate to /call only once accepted (below). Background
      // / cold-launch calls still push /call immediately (Bug #9 — /call must
      // own the resume). This flag bridges the suppressed push to onAccepted.
      let suppressedForegroundRing = false;
      const detachInviteHandlers = () => {
        if (!inviteHandlersAttached) return;
        inviteHandlersAttached = false;
        try {
          invite.off(CallInvite.Event.Cancelled, onCancelled);
        } catch {
          /* SDK may already have unbound */
        }
        try {
          invite.off(CallInvite.Event.Accepted, onAccepted);
        } catch {
          /* noop */
        }
        telemetryCounters.dec('twilioListeners', 2);
      };

      const onCancelled = () => {
        pendingInvite = null;
        void endCallTelemetry('invite_cancelled');
        endCall();
        // CallKit may already have activated the call session for the ring, so a
        // cancelled invite has to restore the normal mode too.
        restoreNormalAudioModeAfterCall('invite_cancelled_restore');
        detachInviteHandlers();
      };

      const onAccepted = (call: any) => {
        activeCallObj = call;
        pendingInvite = null;
        useCallStore.getState().setCallState('connected');
        bindCallEvents(call);
        // If we suppressed the foreground ring screen (Option A), navigate now
        // so the connected-state routing (recording / CallBanner) takes over.
        if (suppressedForegroundRing) {
          suppressedForegroundRing = false;
          router.push('/call');
        }
        analytics.capture(ANALYTICS_EVENTS.CALL.ACCEPTED, { source: 'callkit' });
        void captureCallMicPermission('callkit_accepted');
        // bindCallEvents will own telemetry from Connected/Disconnected;
        // drop the invite-level listeners now that the call has progressed.
        detachInviteHandlers();
      };

      invite.on(CallInvite.Event.Cancelled, onCancelled);
      invite.on(CallInvite.Event.Accepted, onAccepted);
      inviteHandlersAttached = true;
      telemetryCounters.inc('twilioListeners', 2);

      // Telemetry starts at the earliest signal of a call. Snapshots from
      // before-accept are critical for the WatchdogTermination repros.
      void startCallTelemetry('invite_received');

      setIncomingCall(callSid, from);
      void resolveCallerUsername(from);
      analytics.capture(ANALYTICS_EVENTS.CALL.INCOMING_RECEIVED, { from_number: from });

      // Delay navigation slightly so the call state (ringing / connected)
      // has settled before /call mounts.
      //
      // We MUST navigate to /call regardless of whether CallKit already
      // accepted (cold-launch scenario): /call owns the state-driven
      // routing — `state==='ringing'` renders IncomingCallScreen, while
      // `state==='connected'` dismisses to the recording flow (record
      // plan) or back to tabs (free / pro) via CallBanner.
      //
      // Previous version skipped this push when `callKitAccepted===true`,
      // which left cold-launches stranded: the user accepted from the
      // native CallKit UI, the app cold-started, but no in-app screen
      // was ever pushed → black screen, no way to interact. The user
      // could only end the call via the OS-level control. (Bug #9.)
      //
      // Guard with `activeCall != null` so a rapid Cancelled before the
      // 150 ms timer fires doesn't push an empty /call modal.
      setTimeout(() => {
        const st = useCallStore.getState();
        if (st.activeCall == null) return;
        // Foreground + still ringing → CallKit is the single ring surface:
        // suppress our redundant screen and defer navigation to onAccepted.
        // Any already-accepted (connected) or background/cold-launch call falls
        // through and pushes /call as before.
        if (AppState.currentState === 'active' && st.activeCall.state === 'ringing') {
          suppressedForegroundRing = true;
          return;
        }
        router.push('/call');
      }, 150);
    };

    voice.on(Voice.Event.CallInvite, onCallInvite);

    // Cold-call adoption probes. By this point getVoice() has instantiated the
    // native module, whose -init synchronously adopted any bootstrap-answered
    // call into its callMap — so a boot probe right now already finds it. The
    // foreground probe covers the locked-answer case (answered on the lock
    // screen, app foregrounded later). The timed retries (b147) cover ordering
    // races — a handoff that lands moments after the boot probe (e.g. the
    // connect-time self-heal path) with no foreground transition to re-trigger
    // it. All probes dedup per callSid, so retries are free when nothing is
    // there and harmless when adoption already happened.
    void adoptNativeColdCall('boot_probe');
    // Poll ladder (b148): the handoff can land at ANY moment during the ring
    // window (the user may answer 5-40s after the module boots), so fixed 3s/10s
    // retries missed answers outside those instants. Poll every 2s for 40s
    // (CallKit's ring window), stopping as soon as a call is adopted or JS
    // already tracks one. Each tick is one cheap native getCalls round-trip.
    let probeTicks = 0;
    const probeInterval = setInterval(() => {
      probeTicks += 1;
      if (probeTicks > 20 || useCallStore.getState().activeCall) {
        clearInterval(probeInterval);
        return;
      }
      void adoptNativeColdCall(`poll_${probeTicks * 2}s`);
    }, 2000);
    const coldProbeSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void adoptNativeColdCall('foreground_probe');
    });

    const setup = async () => {
      try {
        if (!pushKitReady) {
          // The PushKit registry is created NATIVELY at app launch by the
          // `withTwilioVoipPushRegistry` config plugin (AppDelegate). That is
          // what lets a cold launch from a terminated state report the call to
          // CallKit before iOS's watchdog deadline (the FrontBoard 0xBAADCA11
          // kill). We must NOT call `voice.initializePushRegistry()` here as
          // well — that would stand up a SECOND PKPushRegistry and double-handle
          // every incoming VoIP push. The native registry already feeds the
          // device-token and incoming-push events into the SDK module, which
          // this hook observes; we only need to mark the SDK as ready and let
          // the device token settle before the first registration attempt.
          pushKitReady = true;
          await new Promise((r) => setTimeout(r, 3000));
        }

        // Tell the native CallKit (iOS) / notification (Android) layer
        // to render the `DisplayName` custom parameter Twilio sends in
        // the push payload. The backend always emits this parameter
        // (`@username` for app-to-app, the caller's E.164 for PSTN), so
        // the template never falls through to the literal placeholder.
        // Persisted in NSUserDefaults so it survives app restarts; we
        // re-set it on every mount idempotently to recover from any
        // out-of-band reset.
        await voice.setIncomingCallContactHandleTemplate('${DisplayName}');

        // Cold-launch CallKit fix — persist the gate to NSUserDefaults so the native
        // AttoVoipBootstrap can read it at PUSH time (a cold launch has no PostHog
        // runtime). Uses its OWN flag `coldlaunch_callkit_enabled` — DECOUPLED from
        // audio_injection so the cold path can be tested WITHOUT the injection engine
        // (whose mid-call audio-device swap is a separate crash source). Belt-and-
        // suspenders: the primary write is at app launch (see (tabs)/_layout.tsx),
        // this one just refreshes it whenever Twilio (re)registers.
        persistColdLaunchCallKitFlag();
        // Same disk-persist for the injection cohort, so the native Twilio module
        // -init installs the custom engine (not the stock device) — the fix for
        // the clobber that left injected audio inaudible to the far party.
        persistAudioInjectionFlag();
        // And the render-format-recheck cohort, read by the same device at
        // activation time. Off by default, so this is a no-op for everyone
        // outside the cohort.
        persistEngineRenderFormatRecheckFlag();

        // If we were previously registered under a different account,
        // unregister that identity before binding the new one. Without
        // this, Twilio keeps routing incoming calls to whichever identity
        // was registered first — the multi-account switch bug (Bug #2).
        if (
          activeIdentityAccountId != null &&
          activeIdentityAccountId !== activeAccountId
        ) {
          await unregisterCurrent();
        }

        await registerDevice(activeAccountId);
      } catch (err) {
        console.error('[TwilioVoice] Setup FAILED:', err);
        Sentry.captureException(err, {
          tags: { feature: 'twilio-voice', step: 'setup' },
        });
      }
    };
    setup();

    // Closure captures the current activeAccountId. On switch, the effect
    // reruns and a new interval is installed — the old one is cleared in
    // the cleanup below before this new one schedules.
    const refreshInterval = setInterval(() => {
      void registerDevice(activeAccountId);
    }, TOKEN_REFRESH_MS);

    return () => {
      // Invalidate any in-flight register attempt — its captured `gen`
      // will no longer match `currentRegistrationGen` and it'll bail.
      currentRegistrationGen++;
      clearInterval(refreshInterval);
      clearInterval(probeInterval);
      coldProbeSub.remove();
      voice.off(Voice.Event.CallInvite, onCallInvite);
      // Fire-and-forget; do not block React unmount on a network round-trip.
      void unregisterCurrent();
    };
  }, [isAuthenticated, activeAccountId, registerDevice, setIncomingCall, endCall]);
}
