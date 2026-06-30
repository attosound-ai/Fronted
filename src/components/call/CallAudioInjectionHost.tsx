import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useCallStore } from '@/stores/callStore';
import { useFeatureFlag } from '@/lib/analytics';
import {
  getAudioInjector,
  AUDIO_INJECTION_FLAG,
} from '@/lib/callAudio/createAudioInjector';
import { installInjectionDeviceIfEnabled } from '@/hooks/useTwilioVoice';

/**
 * CallAudioInjectionHost — the single global owner of the audio-injection
 * LIFECYCLE, mounted once at the root next to DtmfKeypadHost. It renders no UI
 * yet (the now-injecting indicator is added in a later phase); its job is to:
 *
 *  1. mirror the engine's snapshots into callStore.injection (one subscription
 *     for the whole app, so any surface can read injection state), and
 *  2. guarantee teardown — when the call ends, tell the engine to stop, so a
 *     hang-up / disconnect can NEVER strand a playing engine (the WatchdogTermination
 *     class of bug the call subsystem already fights).
 *
 * With the feature flag OFF (Phase-0 default) getAudioInjector() is the inert
 * NullAudioInjector: the subscription never emits and stop() is a no-op, so this
 * host is completely dormant.
 */
export function CallAudioInjectionHost() {
  const flagEnabled = useFeatureFlag(AUDIO_INJECTION_FLAG) === true;
  const setInjection = useCallStore((s) => s.setInjection);
  const activeCallSid = useCallStore((s) => s.activeCall?.callSid ?? null);

  // Mirror engine snapshots → store (re-subscribes if the flag flips the engine).
  useEffect(() => {
    const injector = getAudioInjector();
    const unsubscribe = injector.subscribe((snap) => {
      setInjection(snap.state === 'idle' || snap.state === 'stopped' ? null : snap);
    });
    return unsubscribe;
  }, [flagEnabled, setInjection]);

  // Stop the engine the instant the call ends (sid → null). Idempotent + safe.
  const prevSidRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevSidRef.current;
    prevSidRef.current = activeCallSid;
    if (prev && !activeCallSid) {
      void getAudioInjector().stop('call_ended');
    }
  }, [activeCallSid]);

  // PRE-INSTALL the custom audio device while IDLE so it's already Twilio's active
  // device BEFORE an incoming call arrives. Installing at accept-time raced flag
  // loading and silently skipped for INCOMING calls — westcol never installed, so
  // its engine stayed inert (recording captured 0 frames, transmit was silent,
  // wave flat; confirmed via PostHog Jun 30). useFeatureFlag is the reliable
  // reactive flag; this re-runs whenever a call ends (sid → null) so the device
  // is re-armed for the next call. installInjectionDeviceIfEnabled no-ops when the
  // device is already installed, so this is cheap.
  useEffect(() => {
    if (Platform.OS !== 'ios' || !flagEnabled || activeCallSid) return;
    void installInjectionDeviceIfEnabled('preinstall');
  }, [flagEnabled, activeCallSid]);

  return null;
}
