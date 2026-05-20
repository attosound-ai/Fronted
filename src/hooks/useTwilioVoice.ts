import { useEffect, useCallback } from 'react';
import { Platform, ActionSheetIOS } from 'react-native';
import { setAudioModeAsync } from 'expo-audio';
import { router } from 'expo-router';
import { useCallStore } from '@/stores/callStore';
import { telephonyService } from '@/lib/api/telephonyService';
import { useAuthStore } from '@/stores/authStore';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
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
let isRegistering = false;
// Reentrancy guard for the audio-route picker — repeated speaker toggles
// during a call were one of the WatchdogTermination triggers seen in
// REACT-NATIVE-8 (sessions that crashed had `call_speaker_toggled` as
// their last event). Only one toggle may be in-flight at a time.
let isSpeakerToggling = false;

function getVoice(): any {
  if (!voiceInstance) {
    const { Voice } = getTwilio();
    voiceInstance = new Voice();
  }
  return voiceInstance;
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
    // Do NOT touch the audio session here — Twilio owns it during the call.
  };

  const onConnectFailure = () => {
    activeCallObj = null;
    void endCallTelemetry('call_connect_failure');
    endCall();
    teardown();
  };

  const onDisconnected = () => {
    activeCallObj = null;
    void endCallTelemetry('call_disconnected');
    endCall();
    // Restore normal audio mode after the call ends
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    teardown();
  };

  const onReconnecting = () => setCallState('reconnecting');
  const onReconnected = () => setCallState('connected');

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
    telemetryCounters.dec('twilioListeners', 5);
    if (activeCallTeardown === teardown) activeCallTeardown = null;
  };

  call.on(Call.Event.Connected, onConnected);
  call.on(Call.Event.ConnectFailure, onConnectFailure);
  call.on(Call.Event.Disconnected, onDisconnected);
  call.on(Call.Event.Reconnecting, onReconnecting);
  call.on(Call.Event.Reconnected, onReconnected);
  telemetryCounters.inc('twilioListeners', 5);

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

export function hangUpCall() {
  analytics.capture(ANALYTICS_EVENTS.CALL.ENDED);
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

  const registerDevice = useCallback(async () => {
    if (!IS_IOS) return; // Twilio Voice not configured for Android yet
    if (isRegistering) return;
    if (!pushKitReady) return;
    if (!useAuthStore.getState().isAuthenticated) return;

    isRegistering = true;
    try {
      const { token } = await telephonyService.getVoiceToken();

      const voice = getVoice();
      await voice.register(token);
      lastToken = token;
      setRegistered(true);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Voice registration failed';
      console.error('[TwilioVoice] Registration FAILED:', message);
      Sentry.captureException(error, {
        tags: { feature: 'twilio-voice', step: 'register' },
      });
      setRegistered(false, message);
    } finally {
      isRegistering = false;
    }
  }, [setRegistered]);

  useEffect(() => {
    // Skip Twilio Voice setup entirely on Android — Firebase (google-services.json)
    // is not configured yet, and the native module crashes without it.
    if (!isAuthenticated || !IS_IOS) return;

    const { Voice, CallInvite } = getTwilio();
    const voice = getVoice();

    const onCallInvite = (invite: any) => {
      pendingInvite = invite;

      const callSid = invite.getCallSid();
      const from = invite.getFrom() || 'Unknown';
      let callKitAccepted = false;

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
        callKitAccepted = true;
        activeCallObj = call;
        pendingInvite = null;
        useCallStore.getState().setCallState('connected');
        bindCallEvents(call);
        analytics.capture(ANALYTICS_EVENTS.CALL.ACCEPTED, { source: 'callkit' });
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

      // Delay navigation slightly so CallKit's Accepted event can fire first.
      // When the user answered from a push notification (app closed), CallKit
      // already accepted the call — the Accepted event fires within a few ms.
      // In that case we skip the /call modal entirely.
      setTimeout(() => {
        if (!callKitAccepted) {
          router.push('/call');
        }
      }, 150);
    };

    voice.on(Voice.Event.CallInvite, onCallInvite);

    const setup = async () => {
      try {
        if (!pushKitReady) {
          await voice.initializePushRegistry();
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

        await registerDevice();
      } catch (err) {
        console.error('[TwilioVoice] Setup FAILED:', err);
        Sentry.captureException(err, {
          tags: { feature: 'twilio-voice', step: 'setup' },
        });
      }
    };
    setup();

    const refreshInterval = setInterval(registerDevice, TOKEN_REFRESH_MS);

    return () => {
      clearInterval(refreshInterval);
      voice.off(Voice.Event.CallInvite, onCallInvite);
    };
  }, [isAuthenticated, registerDevice, setIncomingCall, endCall]);
}
