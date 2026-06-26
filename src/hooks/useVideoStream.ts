import { useEffect, useRef, useState } from 'react';
import type { VideoPlayer } from 'expo-video';

import { hlsToMp4Fallback } from '@/lib/media/cloudinaryUrl';

/**
 * useVideoStream — shared playback glue for every video surface in the app.
 *
 * Responsibilities (kept out of each player component so behaviour is identical
 * everywhere):
 *  - exposes `isReady` so the caller can show a poster/thumbnail until the
 *    first frame is decoded (no more black rectangles while buffering),
 *  - transparently falls back from the adaptive HLS source to an optimized MP4
 *    if the player errors (e.g. the asset's `sp_auto` rendition isn't available
 *    yet), so HLS can never *regress* playback versus the old original-file URL.
 *
 * Play/pause stays in the caller because the trigger differs per surface
 * (`isVisible` in the feed vs `isActive` in reels).
 *
 * @param player expo-video player instance (or null while initializing)
 * @param source the HLS source the player was created with
 * @param active whether this surface is currently the visible/active one
 */
export function useVideoStream(
  player: VideoPlayer | null,
  source: string | null | undefined,
  active: boolean
): boolean {
  const [isReady, setIsReady] = useState(false);
  const triedFallback = useRef(false);

  // Reset per-source so a recycled list cell re-evaluates from scratch.
  useEffect(() => {
    triedFallback.current = false;
    setIsReady(false);
  }, [source]);

  useEffect(() => {
    if (!player) return;
    if (player.status === 'readyToPlay') setIsReady(true);

    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') {
        setIsReady(true);
        return;
      }
      if (status === 'error' && source && !triedFallback.current) {
        const fallback = hlsToMp4Fallback(source);
        if (!fallback) return;
        triedFallback.current = true;
        // Small delay avoids hammering Cloudinary while it derives the asset.
        setTimeout(() => {
          try {
            player.replace(fallback);
            if (active) player.play();
          } catch {
            // player was disposed (cell recycled) — ignore
          }
        }, 500);
      }
    });
    return () => sub.remove();
  }, [player, source, active]);

  return isReady;
}
