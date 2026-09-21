/**
 * useCallPlaybackVideo: a video surface during an engine call. The expo video
 * player is always MUTED (its speaker copy is outside the echo canceller's
 * reference, so the far party would hear it twice) and its audio track plays
 * through the engine session instead. The video free runs on its own clock and
 * is resynced only on transport events and loop boundaries; drift is measured,
 * and corrected only past a hard threshold (segment granular HLS seeks stutter).
 *
 * Claim policy:
 *   explicit: the surface calls play/pause itself (tap to play).
 *   auto: the surface claims while `active` and the global video sound is on,
 *         so the feed mute button decides what the rep hears (and, with 📡,
 *         what the far party hears). Ads must pass `active: false`.
 */

import { useEffect, useRef } from 'react';
import type { VideoPlayer } from 'expo-video';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { useVideoSoundStore } from '@/stores/videoSoundStore';
import { useCallStore } from '@/stores/callStore';
import { useCallPlayback, type CallPlaybackHandle } from './useCallPlayback';
import type { PlaybackSource, PlaybackSurface } from './types';

const DRIFT_SAMPLE_MS = 5000;
const HARD_RESYNC_MS = 1000;

export interface UseCallPlaybackVideoOptions {
  claimPolicy: 'explicit' | 'auto';
  /** The surface is on screen and focused (auto policy). */
  active: boolean;
  loop?: boolean;
}

export function useCallPlaybackVideo(
  player: VideoPlayer | null | undefined,
  ownerId: string,
  surface: PlaybackSurface,
  source: PlaybackSource | null,
  options: UseCallPlaybackVideoOptions
): CallPlaybackHandle {
  const handle = useCallPlayback(ownerId, surface, source, { requires: 'video' });
  const { engineMode, isOwner, isPlaying, positionMs } = handle;
  const soundOn = useVideoSoundStore((s) => !s.isMuted);
  const reason = useCallStore((s) => s.playback.reason);
  const loopCount = useCallStore((s) => s.playback.loopCount);
  const lastDriftSampleRef = useRef(0);

  // 1. The expo player is silent for the whole engine call.
  useEffect(() => {
    if (!player || !engineMode) return;
    try {
      player.muted = true;
    } catch {
      // released player
    }
  }, [player, engineMode]);

  // 2. Auto policy: visible + sound on → own the session; otherwise let go.
  useEffect(() => {
    if (!engineMode || options.claimPolicy !== 'auto') return;
    if (options.active && soundOn) {
      void handle.play();
    } else if (isOwner) {
      void handle.release();
    }
    // handle.play/release are stable per ownerId; isOwner is read for the
    // release branch only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineMode, options.claimPolicy, options.active, soundOn]);

  // 3. The video follows the engine's transport: play/pause mirror, resync on
  //    transport events and loop boundaries, free run otherwise.
  useEffect(() => {
    if (!player || !engineMode || !isOwner) return;
    try {
      if (isPlaying && !player.playing) player.play();
      if (!isPlaying && player.playing) player.pause();
    } catch {
      // released player
    }
  }, [player, engineMode, isOwner, isPlaying]);

  useEffect(() => {
    if (!player || !engineMode || !isOwner) return;
    if (reason !== 'play' && reason !== 'seek' && reason !== 'claim') return;
    try {
      player.currentTime = positionMs / 1000;
    } catch {
      // released player
    }
    // Resync only when a transport event lands, not on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, engineMode, isOwner, reason]);

  useEffect(() => {
    if (!player || !engineMode || !isOwner || loopCount === 0) return;
    try {
      player.currentTime = positionMs / 1000;
    } catch {
      // released player
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, engineMode, isOwner, loopCount]);

  // 4. Drift telemetry (sampled), hard resync only past the threshold.
  useEffect(() => {
    if (!player || !engineMode || !isOwner || !isPlaying) return;
    const now = Date.now();
    if (now - lastDriftSampleRef.current < DRIFT_SAMPLE_MS) return;
    lastDriftSampleRef.current = now;
    try {
      const driftMs = player.currentTime * 1000 - positionMs;
      const corrected = Math.abs(driftMs) > HARD_RESYNC_MS;
      if (corrected) player.currentTime = positionMs / 1000;
      analytics.capture(ANALYTICS_EVENTS.CALL.PLAYBACK_VIDEO_DRIFT, {
        surface,
        owner_id: ownerId,
        drift_ms: Math.round(driftMs),
        corrected,
        loop_count: loopCount,
      });
    } catch {
      // released player
    }
  }, [player, engineMode, isOwner, isPlaying, positionMs, surface, ownerId, loopCount]);

  return handle;
}
