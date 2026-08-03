import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useCallStore } from '@/stores/callStore';
import { useAuthStore } from '@/stores/authStore';
import { useVideoSoundStore } from '@/stores/videoSoundStore';
import { useFeatureFlag, analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
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
  // Re-arm the device whenever the ACTIVE account changes — the install is
  // per-account, so switching to westcol must trigger its own pre-install.
  const activeUserId = useAuthStore((s) => s.user?.id ?? null);

  // Mirror engine snapshots → store (re-subscribes if the flag flips the engine).
  useEffect(() => {
    const injector = getAudioInjector();
    const unsubscribe = injector.subscribe((snap) => {
      setInjection(snap.state === 'idle' || snap.state === 'stopped' ? null : snap);
    });
    return unsubscribe;
  }, [flagEnabled, setInjection]);

  // The post's mute button ↔ the injection MONITOR, live.
  //
  // While transmitting, the local video player is force-muted on purpose (its
  // loudspeaker copy isn't in the echo-cancel reference, so the far party heard
  // it doubled — see useCallAwareVideoAudio). What the rep actually hears is the
  // engine's MONITOR of the injected track, which the mute button never touched:
  // tapping mute did nothing until transmit was switched off (David, Jul 19:
  // "el audio no se quita sino hasta que dejo de compartir").
  //
  // Now each control owns exactly one thing, no collisions:
  //   📡 transmit → does the FAR PARTY get the audio
  //   🔇 mute     → does the REP hear it (monitor), sharing continues
  const isMuted = useVideoSoundStore((s) => s.isMuted);
  const isInjecting = useCallStore(
    (s) => s.injection?.state === 'playing' || s.injection?.state === 'preparing'
  );
  const prevMonitorRef = useRef<boolean | null>(null);
  // Whether THIS injection has already had its initial monitor applied.
  const armedForInjectionRef = useRef(false);
  useEffect(() => {
    if (!isInjecting) {
      prevMonitorRef.current = null;
      armedForInjectionRef.current = false;
      return;
    }

    // START OF AN INJECTION → monitor ON, unconditionally.
    //
    // This used to be `monitor = !isMuted` from the very first tick, where
    // `isMuted` is the FEED's global video-mute store. That store is muted by
    // default, so transmitting a track from the editor started with the monitor
    // OFF: the far party heard the track and the rep heard nothing (David,
    // Aug 2: "durante los primeros 2 segundos yo no oía el clip, pero mi madre
    // sí" — telemetry showed monitor=false/muted=true 3s before inject start).
    // Whether the feed's videos are muted has nothing to do with whether you
    // should hear the track you are deliberately sending into a call.
    // A deliberate mute toggle DURING the injection still applies (below).
    if (!armedForInjectionRef.current) {
      armedForInjectionRef.current = true;
      prevMonitorRef.current = true;
      try {
        getAudioInjector().setMonitor(true);
        analytics.capture(ANALYTICS_EVENTS.CALL.AUDIO_INJECT_MONITOR, {
          monitor: true,
          muted: isMuted,
          reason: 'inject_start_default_on',
        });
      } catch {
        // Engine may be tearing down; monitor is a comfort control, never fatal.
      }
      return;
    }

    // Subsequent mute toggles while transmitting DO drive the monitor: 🔇
    // controls whether the REP hears it, 📡 controls whether the far party does.
    const monitor = !isMuted;
    if (prevMonitorRef.current === monitor) return;
    prevMonitorRef.current = monitor;
    try {
      getAudioInjector().setMonitor(monitor);
      analytics.capture(ANALYTICS_EVENTS.CALL.AUDIO_INJECT_MONITOR, {
        monitor,
        muted: isMuted,
        reason: 'user_mute_toggle',
      });
    } catch {
      // Engine may be tearing down; monitor is a comfort control, never fatal.
    }
  }, [isInjecting, isMuted]);

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
  }, [flagEnabled, activeCallSid, activeUserId]);

  return null;
}
