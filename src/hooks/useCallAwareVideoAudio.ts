import { useEffect } from 'react';
import type { VideoPlayer } from 'expo-video';

import { useCallStore } from '@/stores/callStore';

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

  useEffect(() => {
    if (!player) return;
    try {
      player.audioMixingMode = inCall ? 'mixWithOthers' : 'auto';
    } catch {
      // Player may be released or on an older runtime; non-fatal.
    }
  }, [player, inCall]);
}
