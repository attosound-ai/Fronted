import { useEffect } from 'react';
import type { VideoPlayer } from 'expo-video';

import { useCallStore } from '@/stores/callStore';
import { useVideoSoundStore } from '@/stores/videoSoundStore';

/**
 * Stop an expo-video player from stealing the call's audio session.
 *
 * By default expo-video uses `audioMixingMode: 'auto'`, which puts the
 * AVAudioSession into the **Playback** category (exclusive, no microphone).
 * When a call is active that overrides Twilio's **PlayAndRecord** session and
 * the call silently loses its mic — confirmed on build 55 via the audio-path
 * telemetry: during a call placed while the feed was playing, the tick reported
 * `category=Playback`, `inPort=none`, output on `BluetoothA2DPOutput` (a
 * playback-only profile) → no two-way audio. The same call placed with no media
 * playing showed `PlayAndRecord` + `BluetoothHFP` in/out → audio worked.
 *
 * During a call we switch the player to `mixWithOthers` (the lowest-priority
 * mode): its audio MIXES into the call's PlayAndRecord session instead of
 * taking it over — so the rep keeps hearing the feed/reel AND the call keeps
 * its microphone. Reverted to `auto` when no call is active, so normal feed
 * playback (incl. through the silent switch) is unchanged.
 *
 * Pure JS — ships over-the-air. Pair with the PlayAndRecord re-assert in
 * `useTwilioVoice`'s onConnected for the case where a video already held
 * Playback before the call connected.
 */
export function useCallAwareVideoAudio(player: VideoPlayer | null | undefined): void {
  const inCall = useCallStore((s) => s.activeCall != null);
  const isMuted = useVideoSoundStore((s) => s.isMuted);
  const isInjecting = useCallStore(
    (s) => s.injection?.state === 'playing' || s.injection?.state === 'preparing'
  );

  useEffect(() => {
    if (!player) return;
    try {
      // ALWAYS mixWithOthers — never flip back to 'auto' (David, Jul 27).
      // 'auto' seizes the Playback category (output-only, no microphone). Making it
      // conditional on `inCall` left a fatal window: on a VoIP-push cold launch the
      // players mount before JS knows a call exists, so they grabbed the session and
      // the call connected with no mic → call_connect_failure → dropped call
      // (telemetry: category=Playback, inPort=none). Players are now created with
      // mixWithOthers too; this effect just guarantees it never regresses.
      player.audioMixingMode = 'mixWithOthers';
    } catch {
      // Player may be released or on an older runtime; non-fatal.
    }
  }, [player, inCall]);

  // While TRANSMITTING app audio into the call (📡), mute the LOCAL player. The
  // loudspeaker copy of the reel is NOT in the voice processor's echo-cancellation
  // reference (it plays outside the call's audio unit), so the mic picked it up and
  // the far party heard a second, offset copy of the reel on top of the injected
  // one — "mete un audio externo". The rep still hears the injected track via the
  // engine's monitor path (which IS echo-cancelled correctly). Restores the user's
  // global mute preference when injection stops.
  useEffect(() => {
    if (!player) return;
    try {
      if (isInjecting) {
        player.muted = true;
      } else {
        player.muted = useVideoSoundStore.getState().isMuted;
      }
    } catch {
      // Player may be released; non-fatal.
    }
    // isMuted is in the deps so a mute toggle re-applies immediately once
    // injection ends (while injecting the player stays force-muted by design;
    // the rep's monitor is what the mute button drives — CallAudioInjectionHost).
  }, [player, isInjecting, isMuted]);
}
