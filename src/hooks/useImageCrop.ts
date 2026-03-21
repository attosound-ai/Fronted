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
   *
   * resizeMode="cover" scales the image so the SHORTER side fills containerSize.
   * The longer side overflows and is centered. We must account for this when
   * mapping screen-space gestures back to original-image pixels.
   */
  const computeCrop = useCallback(
    (origW: number, origH: number): CropRegion => {
      const s = scale.value;
      const tx = translateX.value;
      const ty = translateY.value;

      // resizeMode="cover": scale so shorter axis fills containerSize
      const imageAspect = origW / origH;
      let displayW: number;
      let displayH: number;
      if (imageAspect > 1) {
        // landscape: height fills container, width overflows
        displayH = containerSize;
        displayW = containerSize * imageAspect;
      } else {
        // portrait or square: width fills container, height overflows
        displayW = containerSize;
        displayH = containerSize / imageAspect;
      }

      // Pixels per screen point at current scale
      const pxPerPtX = origW / (displayW * s);
      const pxPerPtY = origH / (displayH * s);

      // Circle center in container coords = (containerSize/2, containerSize/2)
      // Image center in container coords = (containerSize/2, containerSize/2) before gestures
      // With translate, image center moves by (tx, ty) in screen pts
      // Circle top-left in image-display coords:
      const circleLeft = (containerSize - circleSize) / 2;
      const circleTop = (containerSize - circleSize) / 2;

      // Image display origin (top-left of the displayed image in container coords)
      const imgDisplayLeft = (containerSize - displayW * s) / 2 + tx * s;
      const imgDisplayTop = (containerSize - displayH * s) / 2 + ty * s;

      // Circle position relative to scaled image
      const relX = (circleLeft - imgDisplayLeft) / s;
      const relY = (circleTop - imgDisplayTop) / s;

      const cropW = (circleSize / s) * pxPerPtX;
      const cropH = (circleSize / s) * pxPerPtY;
      const originX = relX * pxPerPtX;
      const originY = relY * pxPerPtY;

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
