import { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  GestureDetector,
  GestureHandlerRootView,
  Gesture,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';

import { Text } from '@/components/ui/Text';
import { imageCropService, CropRegion } from '@/lib/media/imageCropService';
import { haptic } from '@/lib/haptics/hapticService';

const CIRCLE_PADDING = 40;
const OVERLAY_COLOR = 'rgba(0,0,0,0.72)';
const MIN_SCALE = 1;
const MAX_SCALE = 5;

interface ImageCropModalProps {
  visible: boolean;
  imageUri: string | null;
  onCrop: (uri: string) => void;
  onCancel: () => void;
}

/**
 * ImageCropModal — circular avatar cropping.
 *
 * The image is initially scaled so its SHORT side = circleSize.
 * The user can then pan (to slide the long side) and pinch to zoom.
 * The crop region maps exactly to what's visible inside the circle.
 */
export function ImageCropModal({
  visible,
  imageUri,
  onCrop,
  onCancel,
}: ImageCropModalProps) {
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const circleSize = screenWidth - CIRCLE_PADDING * 2;
  const containerSize = screenWidth;

  const [isProcessing, setIsProcessing] = useState(false);
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);

  // Gesture shared values
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  // Base display size (set when image loads)
  const baseW = useSharedValue(0);
  const baseH = useSharedValue(0);

  // Reset when modal opens
  useEffect(() => {
    if (visible && imageUri) {
      scale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      savedScale.value = 1;
      savedX.value = 0;
      savedY.value = 0;
      setImgDims(null);
      Image.getSize(
        imageUri,
        (w, h) => {
          setImgDims({ w, h });
          // Scale so short side = circleSize
          const aspect = w / h;
          if (aspect >= 1) {
            // landscape: height = circleSize, width = circleSize * aspect
            baseW.value = circleSize * aspect;
            baseH.value = circleSize;
          } else {
            // portrait: width = circleSize, height = circleSize / aspect
            baseW.value = circleSize;
            baseH.value = circleSize / aspect;
          }
        },
        () => {}
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, imageUri]);

  /** Clamp so the image always covers the circle */
  const clamp = (tx: number, ty: number, s: number) => {
    'worklet';
    const imgW = baseW.value * s;
    const imgH = baseH.value * s;
    const maxX = Math.max(0, (imgW - circleSize) / 2);
    const maxY = Math.max(0, (imgH - circleSize) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, tx)),
      y: Math.max(-maxY, Math.min(maxY, ty)),
    };
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      'worklet';
      scale.value = Math.max(MIN_SCALE, Math.min(MAX_SCALE, savedScale.value * e.scale));
    })
    .onEnd(() => {
      'worklet';
      savedScale.value = scale.value;
      const c = clamp(translateX.value, translateY.value, scale.value);
      translateX.value = withSpring(c.x, { damping: 20, stiffness: 200 });
      translateY.value = withSpring(c.y, { damping: 20, stiffness: 200 });
      savedX.value = c.x;
      savedY.value = c.y;
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      'worklet';
      const c = clamp(
        savedX.value + e.translationX,
        savedY.value + e.translationY,
        scale.value
      );
      translateX.value = c.x;
      translateY.value = c.y;
    })
    .onEnd(() => {
      'worklet';
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  const gesture = Gesture.Simultaneous(pan, pinch);

  const animatedStyle = useAnimatedStyle(() => ({
    width: baseW.value,
    height: baseH.value,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const handleApply = useCallback(async () => {
    if (!imageUri || !imgDims) return;
    setIsProcessing(true);
    haptic('light');
    try {
      const s = scale.value;
      const tx = translateX.value;
      const ty = translateY.value;
      const bw = baseW.value;
      const bh = baseH.value;

      // Pixels per display point
      const pxPerPtX = imgDims.w / bw;
      const pxPerPtY = imgDims.h / bh;

      // The circle center is at (0, 0) in our coordinate system (image centered).
      // With translate (tx, ty) and scale s, the image's top-left in circle-centered coords:
      //   imgLeft = -(bw * s / 2) + tx
      //   imgTop  = -(bh * s / 2) + ty
      // The circle's top-left is at (-circleSize/2, -circleSize/2)
      // Circle top-left relative to image top-left:
      //   relX = -circleSize/2 - imgLeft = -circleSize/2 + bw*s/2 - tx
      //   relY = -circleSize/2 - imgTop  = -circleSize/2 + bh*s/2 - ty
      // In unscaled image display coords: divide by s
      // Then convert to pixels: multiply by pxPerPt

      const relX = (-circleSize / 2 + (bw * s) / 2 - tx) / s;
      const relY = (-circleSize / 2 + (bh * s) / 2 - ty) / s;
      const cropDisplaySize = circleSize / s;

      const region: CropRegion = {
        originX: Math.max(0, relX * pxPerPtX),
        originY: Math.max(0, relY * pxPerPtY),
        width: Math.min(cropDisplaySize * pxPerPtX, imgDims.w),
        height: Math.min(cropDisplaySize * pxPerPtY, imgDims.h),
      };

      const croppedUri = await imageCropService.cropSquare(imageUri, region);
      onCrop(croppedUri);
    } catch {
      onCrop(imageUri);
    } finally {
      setIsProcessing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUri, imgDims, onCrop]);

  const handleCancel = useCallback(() => {
    haptic('selection');
    onCancel();
  }, [onCancel]);

  if (!imageUri) return null;

  const circleOffset = (containerSize - circleSize) / 2;

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <GestureHandlerRootView style={styles.root}>
        <View
          style={[
            styles.safeArea,
            { paddingTop: insets.top, paddingBottom: insets.bottom },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={handleCancel}
              disabled={isProcessing}
            >
              <Text variant="body" style={styles.cancelText}>
                Cancel
              </Text>
            </TouchableOpacity>
            <Text variant="body" style={styles.headerTitle}>
              Position Photo
            </Text>
            <View style={styles.headerButton}>
              {isProcessing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <TouchableOpacity onPress={handleApply} disabled={!imgDims}>
                  <Text
                    variant="body"
                    style={[styles.applyText, !imgDims && styles.dimmed]}
                  >
                    Apply
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Image + Gesture Area */}
          <View
            style={[
              styles.imageContainer,
              { width: containerSize, height: containerSize },
            ]}
          >
            <GestureDetector gesture={gesture}>
              <View
                style={{
                  width: containerSize,
                  height: containerSize,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Animated.Image
                  source={{ uri: imageUri }}
                  style={animatedStyle}
                  resizeMode="cover"
                />
              </View>
            </GestureDetector>

            {/* Dark overlay with circular cutout */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <View
                style={[
                  styles.overlayRect,
                  { top: 0, left: 0, right: 0, height: circleOffset },
                ]}
              />
              <View
                style={[
                  styles.overlayRect,
                  { top: circleOffset + circleSize, left: 0, right: 0, bottom: 0 },
                ]}
              />
              <View
                style={[
                  styles.overlayRect,
                  { top: circleOffset, left: 0, width: circleOffset, height: circleSize },
                ]}
              />
              <View
                style={[
                  styles.overlayRect,
                  {
                    top: circleOffset,
                    left: circleOffset + circleSize,
                    right: 0,
                    height: circleSize,
                  },
                ]}
              />
              <View
                style={{
                  position: 'absolute',
                  top: circleOffset,
                  left: circleOffset,
                  width: circleSize,
                  height: circleSize,
                  borderRadius: circleSize / 2,
                  borderWidth: 2,
                  borderColor: 'rgba(255,255,255,0.8)',
                }}
              />
            </View>

            {!imgDims && (
              <View style={styles.loadingOverlay} pointerEvents="none">
                <ActivityIndicator size="large" color="#FFFFFF" />
              </View>
            )}
          </View>

          <View style={styles.bottomArea}>
            <Text variant="small" style={styles.hintText}>
              Drag and pinch to position your photo
            </Text>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  safeArea: { flex: 1, backgroundColor: '#000000', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  headerButton: { width: 80, alignItems: 'center', paddingVertical: 4 },
  headerTitle: { color: '#FFFFFF', fontFamily: 'Archivo_600SemiBold' },
  cancelText: { color: '#888888' },
  applyText: { color: '#FFFFFF', fontFamily: 'Archivo_600SemiBold' },
  dimmed: { opacity: 0.4 },
  imageContainer: { overflow: 'hidden' },
  overlayRect: { position: 'absolute', backgroundColor: OVERLAY_COLOR },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomArea: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    width: '100%',
    alignItems: 'center',
  },
  hintText: { color: '#666666', textAlign: 'center' },
});
