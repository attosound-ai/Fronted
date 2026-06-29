import { useCallback, useEffect, useRef } from 'react';
import { Animated } from 'react-native';

interface UseDoubleTapLikeOptions {
  /** Fired on a single tap (e.g. open the reel viewer, or pause/resume). Deferred
   *  ~300ms so a quick second tap can upgrade it to a double-tap. Omit for no
   *  single-tap action. */
  onSingleTap?: () => void;
  /** Fired on a double tap — typically "like". The heart burst plays regardless. */
  onDoubleTap?: () => void;
}

/**
 * useDoubleTapLike — Instagram-style tap disambiguation shared across every feed
 * video surface (feed video, feed reel, full-screen reel viewer).
 *
 * Single tap runs `onSingleTap` after a short delay; a second tap within 300ms
 * cancels it and runs `onDoubleTap` instead, playing a heart-burst animation.
 *
 * Returns `handleTap` (wire to a Pressable's onPress) plus the `heartScale` /
 * `heartOpacity` values to feed into <HeartBurst />.
 */
export function useDoubleTapLike({ onSingleTap, onDoubleTap }: UseDoubleTapLikeOptions) {
  const lastTap = useRef(0);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;

  const triggerHeart = useCallback(() => {
    heartScale.setValue(0);
    heartOpacity.setValue(1);
    Animated.parallel([
      Animated.spring(heartScale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 15,
        bounciness: 10,
      }),
      Animated.sequence([
        Animated.delay(600),
        Animated.timing(heartOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [heartScale, heartOpacity]);

  const handleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      // Second quick tap → double-tap. Cancel the pending single-tap action.
      if (singleTapTimer.current) {
        clearTimeout(singleTapTimer.current);
        singleTapTimer.current = null;
      }
      lastTap.current = 0;
      // Tactile confirmation for the like gesture (lazy-loaded like the rest of
      // the app's haptics; silently no-ops on the simulator / devices without a
      // haptic motor). 'medium' gives a firm, unmistakable "pop".
      import('@/lib/haptics/hapticService').then(({ haptic }) => haptic('medium'));
      onDoubleTap?.();
      triggerHeart();
    } else {
      lastTap.current = now;
      if (onSingleTap) {
        singleTapTimer.current = setTimeout(() => {
          onSingleTap();
          singleTapTimer.current = null;
        }, 300);
      }
    }
  }, [onSingleTap, onDoubleTap, triggerHeart]);

  // Drop any pending single-tap timer on unmount (cell recycled / screen left).
  useEffect(() => {
    return () => {
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    };
  }, []);

  return { handleTap, heartScale, heartOpacity };
}
