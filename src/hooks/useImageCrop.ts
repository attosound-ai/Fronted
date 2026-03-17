import { useCallback } from 'react';
import { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Gesture } from 'react-native-gesture-handler';

import type { CropRegion } from '@/lib/media/imageCropService';

const MIN_SCALE = 1;
const MAX_SCALE = 4;

/**
 * useImageCrop — SRP: encapsulates all gesture state and crop math for the crop modal.
 *
 * @param containerSize - Width/height of the square image container (px)
 * @param circleSize    - Diameter of the circular crop area (px)
 */
export function useImageCrop(containerSize: number, circleSize: number) {
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  // Saved values are updated on gesture end so subsequent gestures start from correct position
  const savedScale = useSharedValue(1);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  /** Clamp translate so the image always covers the circle (worklet-safe). */
  const clampTranslate = (tx: number, ty: number, s: number) => {
    'worklet';
    const maxT = Math.max(0, (containerSize * s - circleSize) / 2);
    return {
      x: Math.max(-maxT, Math.min(maxT, tx)),
      y: Math.max(-maxT, Math.min(maxT, ty)),
    };
  };

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      'worklet';
      const newScale = Math.max(
        MIN_SCALE,
        Math.min(MAX_SCALE, savedScale.value * e.scale)
      );
      scale.value = newScale;
    })
    .onEnd(() => {
      'worklet';
      savedScale.value = scale.value;
      const clamped = clampTranslate(translateX.value, translateY.value, scale.value);
      translateX.value = withSpring(clamped.x, { damping: 20, stiffness: 200 });
      translateY.value = withSpring(clamped.y, { damping: 20, stiffness: 200 });
      savedX.value = clamped.x;
      savedY.value = clamped.y;
    });

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      'worklet';
      const newX = savedX.value + e.translationX;
      const newY = savedY.value + e.translationY;
      const clamped = clampTranslate(newX, newY, scale.value);
      translateX.value = clamped.x;
      translateY.value = clamped.y;
    })
    .onEnd(() => {
      'worklet';
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  const gesture = Gesture.Simultaneous(panGesture, pinchGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  /**
   * Compute the crop region in original image pixels.
   * Called from JS thread when user presses Apply.
   *
   * Math: the Animated.View (containerSize × containerSize) displays the image with resizeMode=cover.
   * With transform { scale: s, translateX: tx, translateY: ty }, what image pixels are visible
   * inside the circle (circleSize × circleSize centered in container)?
   *
   *   imagePixelAtCircleEdgeX = origW/2 - (circleSize/2 + tx) * origW / (containerSize * s)
   *   cropSize = circleSize * origW / (containerSize * s)
   */
  const computeCrop = useCallback(
    (origW: number, origH: number): CropRegion => {
      const s = scale.value;
      const tx = translateX.value;
      const ty = translateY.value;

      const cropW = (circleSize * origW) / (containerSize * s);
      const cropH = (circleSize * origH) / (containerSize * s);

      const originX = origW / 2 - (circleSize / 2 + tx) * (origW / (containerSize * s));
      const originY = origH / 2 - (circleSize / 2 + ty) * (origH / (containerSize * s));

      return {
        originX: Math.max(0, Math.min(originX, origW - cropW)),
        originY: Math.max(0, Math.min(originY, origH - cropH)),
        width: Math.min(cropW, origW),
        height: Math.min(cropH, origH),
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [circleSize, containerSize]
  );

  const reset = useCallback(() => {
    scale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedScale.value = 1;
    savedX.value = 0;
    savedY.value = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { gesture, animatedStyle, computeCrop, reset };
}
