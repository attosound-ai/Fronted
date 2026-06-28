import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { VideoPlayer } from 'expo-video';

import { hlsToMp4Fallback } from '@/lib/media/cloudinaryUrl';
import {
  videoLoadStarted,
  videoLoadCompleted,
  videoError,
  videoFallbackUsed,
  type VideoTelemetryContext,
} from '@/lib/telemetry/videoTelemetry';

/**
 * useVideoStream — shared playback glue for every video surface in the app.
 *
 * Responsibilities (kept out of each player component so behaviour is identical
 * everywhere):
 *  - exposes `isReady` so the caller can show a poster/thumbnail until the
 *    first frame is decoded (no more black rectangles while buffering),
 *  - transparently falls back from the adaptive HLS source to an optimized MP4
 *    if the player errors (e.g. the asset's `sp_auto` rendition isn't available
 *    yet), so HLS can never *regress* playback versus the old original-file URL,
 *  - emits video telemetry (load start/complete with load_ms, errors, fallback)
 *    when a `telemetry` context is supplied, so slow/broken video is observable.
 *
 * Play/pause stays in the caller because the trigger differs per surface
 * (`isVisible` in the feed vs `isActive` in reels).
 *
 * @param player expo-video player instance (or null while initializing)
 * @param source the HLS source the player was created with
 * @param active whether this surface is currently the visible/active one
 * @param telemetry optional context ({ surface, postId }) to report diagnostics
 */
export function useVideoStream(
  player: VideoPlayer | null,
  source: string | null | undefined,
  active: boolean,
  telemetry?: VideoTelemetryContext
): boolean {
  const [isReady, setIsReady] = useState(false);
  const triedFallback = useRef(false);
  // Load-time tracking. Kept in refs so the statusChange listener never needs
  // to re-subscribe just because timing state changed.
  const loadStartedAt = useRef(0);
  const loadReported = useRef(false);
  // Ref so telemetry context identity changing each render doesn't re-subscribe.
  const telemetryRef = useRef(telemetry);
  telemetryRef.current = telemetry;

  // Reset per-source so a recycled list cell re-evaluates from scratch, and
  // start the load-time clock for the new source.
  useEffect(() => {
    triedFallback.current = false;
    loadReported.current = false;
    loadStartedAt.current = Date.now();
    setIsReady(false);
    if (source && telemetryRef.current) {
      videoLoadStarted(telemetryRef.current, source);
    }
  }, [source]);

  useEffect(() => {
    if (!player) return;

    const reportReady = () => {
      setIsReady(true);
      if (telemetryRef.current && !loadReported.current) {
        loadReported.current = true;
        videoLoadCompleted(telemetryRef.current, Date.now() - loadStartedAt.current);
      }
    };

    if (player.status === 'readyToPlay') reportReady();

    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') {
        reportReady();
        return;
      }
      if (status === 'error') {
        const fallback =
          source && !triedFallback.current ? hlsToMp4Fallback(source) : null;
        if (telemetryRef.current) {
          videoError(telemetryRef.current, { source, willFallback: !!fallback });
        }
        if (!fallback) return;
        triedFallback.current = true;
        // Time the fallback's load too, and surface that we recovered via MP4.
        loadReported.current = false;
        loadStartedAt.current = Date.now();
        // Small delay avoids hammering Cloudinary while it derives the asset.
        setTimeout(() => {
          try {
            player.replace(fallback);
            if (active) player.play();
            if (telemetryRef.current) videoFallbackUsed(telemetryRef.current);
          } catch {
            // player was disposed (cell recycled) — ignore
          }
        }, 500);
      }
    });
    return () => sub.remove();
  }, [player, source, active]);

  // Pause every player when the app leaves the foreground so expo-video stops
  // holding its AVPlayerLayer/Metal surface in the background. On a deep "phone
  // off" suspension iOS purges those drawables and the New-Arch surface never
  // re-acquires them on resume → a black screen (build-56 telemetry: JS alive,
  // surface dark). On return to 'active' we restore the caller's intended state
  // (only this surface's `active` flag decides whether it resumes playing).
  // Pairs with expo-video's supportsBackgroundPlayback:false in app.json.
  useEffect(() => {
    if (!player) return;
    const sub = AppState.addEventListener('change', (next) => {
      try {
        if (next === 'active') {
          if (active) player.play();
        } else {
          player.pause();
        }
      } catch {
        // Player may be released (cell recycled) — non-fatal.
      }
    });
    return () => sub.remove();
  }, [player, active]);

  return isReady;
}
