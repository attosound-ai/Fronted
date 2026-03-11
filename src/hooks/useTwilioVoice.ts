import { useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import { Voice, Call, CallInvite, AudioDevice } from '@twilio/voice-react-native-sdk';
import { router } from 'expo-router';
import { useCallStore } from '@/stores/callStore';
import { telephonyService } from '@/lib/api/telephonyService';
import { useAuthStore } from '@/stores/authStore';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import * as Sentry from '@sentry/react-native';

const TOKEN_REFRESH_MS = 50 * 60 * 1000; // Refresh every 50 minutes

// ── Singleton state (module-level) ──
let voiceInstance: Voice | null = null;
let pushKitReady = false;
let activeCallObj: Call | null = null;
let pendingInvite: CallInvite | null = null;
let lastToken: string | null = null;

function getVoice(): Voice {
  voiceInstance ??= new Voice();
  return voiceInstance;
}

// ── Helpers ──

function bindCallEvents(call: Call) {
  const { setCallState, endCall } = useCallStore.getState();
  call.on(Call.Event.Connected, () => setCallState('connected'));
  call.on(Call.Event.ConnectFailure, () => {
    activeCallObj = null;
    endCall();
  });
  call.on(Call.Event.Disconnected, () => {
    activeCallObj = null;
    endCall();
  });
  call.on(Call.Event.Reconnecting, () => setCallState('reconnecting'));
  call.on(Call.Event.Reconnected, () => setCallState('connected'));
}

/** Try to retrieve the active Call from the Voice SDK (e.g. after CallKit accepted). */
async function recoverCallFromSDK(): Promise<Call | null> {
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
  if (pendingInvite) {
    pendingInvite.reject();
    pendingInvite = null;
  }
  useCallStore.getState().endCall();
}

export function hangUpCall() {
  analytics.capture(ANALYTICS_EVENTS.CALL.ENDED);
  if (activeCallObj) {
    activeCallObj.disconnect();
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
  const voice = voiceInstance;
  if (!voice) return;
  const { audioDevices, selectedDevice } = await voice.getAudioDevices();
  const isSpeaker = selectedDevice?.type === AudioDevice.Type.Speaker;
  const target = audioDevices.find(
    (d) => d.type === (isSpeaker ? AudioDevice.Type.Earpiece : AudioDevice.Type.Speaker)
  );
  if (target) {
    await target.select();
    useCallStore.getState().setSpeaker(!isSpeaker);
    analytics.capture(ANALYTICS_EVENTS.CALL.SPEAKER_TOGGLED, { is_speaker: !isSpeaker });
  }
}

// ── Hook (only called once in _layout.tsx) ──

export function useTwilioVoice() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setRegistered = useCallStore((s) => s.setRegistered);
  const setIncomingCall = useCallStore((s) => s.setIncomingCall);
  const endCall = useCallStore((s) => s.endCall);

  const registerDevice = useCallback(async () => {
    if (Platform.OS === 'ios' && !pushKitReady) {
      return;
    }

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
    }
  }, [setRegistered]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const voice = getVoice();

    const onCallInvite = (invite: CallInvite) => {
      pendingInvite = invite;

      const callSid = invite.getCallSid();
      const from = invite.getFrom() || 'Unknown';
      let callKitAccepted = false;

      invite.on(CallInvite.Event.Cancelled, () => {
        pendingInvite = null;
        endCall();
      });

      // CallKit accepted the call (user swiped iOS push notification)
      invite.on(CallInvite.Event.Accepted, (call: Call) => {
        callKitAccepted = true;
        activeCallObj = call;
        pendingInvite = null;
        useCallStore.getState().setCallState('connected');
        bindCallEvents(call);
        analytics.capture(ANALYTICS_EVENTS.CALL.ACCEPTED, { source: 'callkit' });
      });

      setIncomingCall(callSid, from);
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
        if (Platform.OS === 'ios' && !pushKitReady) {
          await voice.initializePushRegistry();
          pushKitReady = true;
          await new Promise((r) => setTimeout(r, 3000));
        }
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
