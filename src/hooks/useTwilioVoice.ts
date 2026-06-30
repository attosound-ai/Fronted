import { useEffect, useCallback } from 'react';
import { Platform, ActionSheetIOS, AppState, NativeModules } from 'react-native';
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
  emitTelemetryMarker,
  telemetryCounters,
} from '@/lib/telemetry';

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

// ── Singleton state (module-level) ──
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
function flattenCallStats(report: any): Record<string, unknown> {
  const local = report?.localAudioTrackStats?.[0] ?? {};
  const remote = report?.remoteAudioTrackStats?.[0] ?? {};
  const ice =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    report?.iceCandidatePairStats?.find((p: any) => p?.activeCandidatePair) ??
    report?.iceCandidatePairStats?.[0] ??
    {};
  return {
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
    bytes_received: remote.bytesRecieved ?? null,
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

async function captureCallStats(reason: string): Promise<void> {
  if (!activeCallObj) return;
  try {
    const report = await activeCallObj.getStats();
    const ac = useCallStore.getState().activeCall;
    analytics.capture('call_quality_stats', {
      reason,
      call_sid: ac?.callSid ?? null,
      call_state: ac?.state ?? null,
      direction: ac?.direction ?? null,
      is_muted: ac?.isMuted ?? null,
      ...flattenCallStats(report),
    });
  } catch {
    // getStats() can reject before media is flowing; the next tick retries.
  }
}

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
    const local = report?.localAudioTrackStats?.[0] ?? {};
    const remote = report?.remoteAudioTrackStats?.[0] ?? {};
    return {
      mic: normAudioLevel(local.audioLevel),
      remote: normAudioLevel(remote.audioLevel),
    };
  } catch {
    return { mic: 0, remote: 0 };
  }
}

function startCallStatsCapture() {
  stopCallStatsCapture();
  // Early one-shot (~3s) to catch a dead mic fast, then every 10s.
  setTimeout(() => void captureCallStats('initial'), 3000);
  callStatsInterval = setInterval(() => void captureCallStats('tick'), 10_000);
}

function stopCallStatsCapture() {
  if (callStatsInterval) {
    clearInterval(callStatsInterval);
    callStatsInterval = null;
  }
}

function bindCallEvents(call: any): () => void {
  const { Call } = getTwilio();
  const { setCallState, endCall } = useCallStore.getState();

  let removed = false;

  const onConnected = () => {
    console.log(
      '[TwilioVoice] Call connected',
      JSON.stringify({ time: new Date().toISOString() })
    );
    setCallState('connected');
    // Telemetry begins capturing tick snapshots at this point — pre-connect
    // states are already covered by startCallTelemetry() at invite/outgoing.
    void startCallTelemetry('call_connected');
    // WebRTC quality stats (mic/remote audio levels, bytes, loss, MOS, RTT).
    startCallStatsCapture();
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
    setTimeout(() => {
      void reclaimAudioSession();
    }, 700);
  };

  const onConnectFailure = () => {
    activeCallObj = null;
    void endCallTelemetry('call_connect_failure');
    endCall();
    teardown();
  };

  const onDisconnected = () => {
    void captureCallStats('final');
    stopCallStatsCapture();
    activeCallObj = null;
    restoreInjectionDevice();
    void endCallTelemetry('call_disconnected');
    endCall();
    // Restore normal audio mode after the call ends
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    teardown();
  };

  const onReconnecting = () => setCallState('reconnecting');
  const onReconnected = () => setCallState('connected');

  // SDK-detected quality warnings (high-jitter, high packet loss, low MOS, ...).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onQualityWarnings = (current: any, previous: any) => {
    analytics.capture('call_quality_warning', {
      call_sid: useCallStore.getState().activeCall?.callSid ?? null,
      current_warnings: Array.isArray(current) ? current : [],
      previous_warnings: Array.isArray(previous) ? previous : [],
    });
  };

  const teardown = () => {
    if (removed) return;
    removed = true;
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

/**
 * Re-select the current audio device to force iOS to activate the VoIP audio session.
 * Called when a call first connects to ensure proper audio routing.
 */
export async function ensureAudioRoute() {
  try {
    const voice = voiceInstance;
    if (!voice) return;
    const { audioDevices, selectedDevice } = await voice.getAudioDevices();
    if (selectedDevice) {
      await selectedDevice.select();
    } else if (audioDevices.length > 0) {
      await audioDevices[0].select();
    }
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
export async function reclaimAudioSession() {
  // Safety net: re-apply PlayAndRecord + mixWithOthers and re-select device.
  // With keepAudioSessionActive: true on players, this should rarely be needed.
  try {
    console.log('[TwilioVoice] reclaimAudioSession: re-locking audio mode...');
    await setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: true,
      interruptionMode: 'mixWithOthers',
    });
    await ensureAudioRoute();
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

// ── Standalone actions (importable from anywhere) ──

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
    } else {
      endCall();
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
      } else {
        // No Call object available, but the call is live — transition anyway
        // so the UI doesn't stay stuck. Hangup/mute won't work until we get it.
        setCallState('connected');
      }
    } else {
      console.error('[TwilioVoice] acceptIncomingCall FAILED:', msg);
      endCall();
    }
  }
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

async function installInjectionDeviceIfEnabled(): Promise<void> {
  if (!IS_IOS) return;
  if (analytics.isFeatureEnabled('audio_injection_enabled') !== true) return;
  const call_sid = useCallStore.getState().activeCall?.callSid ?? null;
  try {
    const ok = await NativeModules.AttoAudioInjection?.installInjectionDevice?.();
    injectionDeviceInstalled = ok === true;
    // THE signal for the silent-injection bug: if this isn't 'installed' the
    // custom device isn't active and the remote will hear nothing injected.
    analytics.capture(ANALYTICS_EVENTS.CALL.AUDIO_INJECT_DEVICE, {
      outcome: ok ? 'installed' : 'install_returned_false',
      call_sid,
    });
  } catch (error: unknown) {
    injectionDeviceInstalled = false;
    analytics.capture(ANALYTICS_EVENTS.CALL.AUDIO_INJECT_DEVICE, {
      outcome: 'install_threw',
      reason: error instanceof Error ? error.message : String(error),
      call_sid,
    });
  }
}

function restoreInjectionDevice(): void {
  // Only restore if we actually installed the custom device — never touch the
  // native engine on a normal (non-injection) call end.
  if (!IS_IOS || !injectionDeviceInstalled) return;
  injectionDeviceInstalled = false;
  try {
    void NativeModules.AttoAudioInjection?.restoreDefaultDevice?.();
    analytics.capture(ANALYTICS_EVENTS.CALL.AUDIO_INJECT_DEVICE, { outcome: 'restored' });
  } catch (error: unknown) {
    analytics.capture(ANALYTICS_EVENTS.CALL.AUDIO_INJECT_DEVICE, {
      outcome: 'restore_threw',
      reason: error instanceof Error ? error.message : String(error),
    });
  }
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
  // last action recorded before WatchdogTermination on 2/7 PostHog
  // sessions. Each select() can reallocate AVAudioSession buffers; stacking
  // them concurrently is the worst case.
  if (isSpeakerToggling) return;
  isSpeakerToggling = true;

  await emitTelemetryMarker('pre_speaker_toggle');

  const finish = (extra?: Record<string, unknown>) => {
    isSpeakerToggling = false;
    void emitTelemetryMarker('post_speaker_toggle', extra);
  };

  const voice = voiceInstance;
  if (!voice) {
    finish({ outcome: 'no_voice' });
    return;
  }

  try {
    const { AudioDevice } = getTwilio();
    const { audioDevices, selectedDevice } = await voice.getAudioDevices();

    if (Platform.OS !== 'ios' || audioDevices.length <= 2) {
      // Android or only Speaker/Earpiece — simple toggle
      const isSpeaker = selectedDevice?.type === AudioDevice.Type.Speaker;
      const target = audioDevices.find(
        (d: any) =>
          d.type === (isSpeaker ? AudioDevice.Type.Earpiece : AudioDevice.Type.Speaker)
      );
      if (target) {
        await target.select();
        useCallStore.getState().setSpeaker(!isSpeaker);
        analytics.capture(ANALYTICS_EVENTS.CALL.SPEAKER_TOGGLED, {
          is_speaker: !isSpeaker,
        });
        finish({ outcome: 'toggled', is_speaker: !isSpeaker });
      } else {
        finish({ outcome: 'no_target' });
      }
      return;
    }

    // iOS with multiple devices — show native picker (AirPods, Bluetooth, etc.)
    const deviceLabels: Record<number, string> = {
      [AudioDevice.Type.Earpiece]: 'iPhone',
      [AudioDevice.Type.Speaker]: 'Speaker',
      [AudioDevice.Type.Bluetooth]: 'Bluetooth',
    };

    const devices = audioDevices.map((d: any) => ({
      device: d,
      label: d.name || deviceLabels[d.type] || `Audio Device`,
      isSelected: d.uuid === selectedDevice?.uuid,
    }));

    const options = [
      ...devices.map((d: any) => (d.isSelected ? `${d.label} ✓` : d.label)),
      'Cancel',
    ];

    ActionSheetIOS.showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex: options.length - 1,
        title: 'Audio Output',
      },
      async (buttonIndex: number) => {
        if (buttonIndex === options.length - 1) {
          finish({ outcome: 'picker_cancelled' });
          return;
        }
        const selected = devices[buttonIndex];
        if (!selected || selected.isSelected) {
          finish({ outcome: 'no_change' });
          return;
        }
        try {
          await selected.device.select();
          const isSpeaker = selected.device.type === AudioDevice.Type.Speaker;
          useCallStore.getState().setSpeaker(isSpeaker);
          analytics.capture(ANALYTICS_EVENTS.CALL.SPEAKER_TOGGLED, {
            is_speaker: isSpeaker,
            device_type: selected.label,
          });
          finish({
            outcome: 'picker_selected',
            is_speaker: isSpeaker,
            device_type: selected.label,
          });
        } catch (err) {
          finish({
            outcome: 'picker_error',
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    );
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
    if (!hasAnyCall) {
      console.log('[TwilioVoice] Setting audio mode: Playback (no call)');
      setAudioModeAsync({ playsInSilentMode: true });
    }
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
      voice.off(Voice.Event.CallInvite, onCallInvite);
      // Fire-and-forget; do not block React unmount on a network round-trip.
      void unregisterCurrent();
    };
  }, [isAuthenticated, activeAccountId, registerDevice, setIncomingCall, endCall]);
}
