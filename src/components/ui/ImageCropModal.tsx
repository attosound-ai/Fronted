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
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

import { Text } from '@/components/ui/Text';
import { useImageCrop } from '@/hooks/useImageCrop';
import { imageCropService } from '@/lib/media/imageCropService';
import { haptic } from '@/lib/haptics/hapticService';

const CIRCLE_PADDING = 40;
const OVERLAY_COLOR = 'rgba(0,0,0,0.72)';

interface ImageCropModalProps {
  visible: boolean;
  imageUri: string | null;
  onCrop: (uri: string) => void;
  onCancel: () => void;
}

/**
 * ImageCropModal — full-screen modal for circular avatar cropping.
 *
 * Shows the image behind a circular overlay. The user drags and pinches
 * to position the photo within the circle, then taps Apply to crop.
 */
export function ImageCropModal({
  visible,
  imageUri,
  onCrop,
  onCancel,
}: ImageCropModalProps) {
  const { width: screenWidth } = useWindowDimensions();
  const containerSize = screenWidth;
  const circleSize = screenWidth - CIRCLE_PADDING * 2;

  const [isProcessing, setIsProcessing] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const { gesture, animatedStyle, computeCrop, reset } = useImageCrop(
    containerSize,
    circleSize
  );

  // Reset gesture state and fetch image dimensions each time modal opens
  useEffect(() => {
    if (visible && imageUri) {
      reset();
      setImageDimensions(null);
      Image.getSize(
        imageUri,
        (width, height) => setImageDimensions({ width, height }),
        () => {}
      );
    }
  }, [visible, imageUri, reset]);

  const handleApply = useCallback(async () => {
    if (!imageUri || !imageDimensions) return;
    setIsProcessing(true);
    haptic('light');
    try {
      const region = computeCrop(imageDimensions.width, imageDimensions.height);
      const croppedUri = await imageCropService.cropSquare(imageUri, region);
      onCrop(croppedUri);
    } catch {
      // Fallback: pass original URI if crop fails
      onCrop(imageUri);
    } finally {
      setIsProcessing(false);
    }
  }, [imageUri, imageDimensions, computeCrop, onCrop]);

  const handleCancel = useCallback(() => {
    haptic('selection');
    onCancel();
  }, [onCancel]);

  if (!imageUri) return null;

  // Circle is centered within the square container
  const circleOffset = (containerSize - circleSize) / 2;

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
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
                <TouchableOpacity onPress={handleApply} disabled={!imageDimensions}>
                  <Text
                    variant="body"
                    style={[styles.applyText, !imageDimensions && styles.dimmed]}
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
              <Animated.View
                style={[{ width: containerSize, height: containerSize }, animatedStyle]}
              >
                <Image
                  source={{ uri: imageUri }}
                  style={{ width: containerSize, height: containerSize }}
                  resizeMode="cover"
                />
              </Animated.View>
            </GestureDetector>

            {/* Dark overlay: 4 rectangles around circular cutout */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              {/* Top */}
              <View
                style={[
                  styles.overlayRect,
                  { top: 0, left: 0, right: 0, height: circleOffset },
                ]}
              />
              {/* Bottom */}
              <View
                style={[
                  styles.overlayRect,
                  { top: circleOffset + circleSize, left: 0, right: 0, bottom: 0 },
                ]}
              />
              {/* Left */}
              <View
                style={[
                  styles.overlayRect,
                  { top: circleOffset, left: 0, width: circleOffset, height: circleSize },
                ]}
              />
              {/* Right */}
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
              {/* Circle border */}
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

            {/* Loading state while Image.getSize fetches dimensions */}
            {!imageDimensions && (
              <View style={styles.loadingOverlay} pointerEvents="none">
                <ActivityIndicator size="large" color="#FFFFFF" />
              </View>
            )}
          </View>

          {/* Bottom action */}
          <View style={styles.bottomArea}>
            <Text variant="small" style={styles.hintText}>
              Drag and pinch to position your photo
            </Text>
            <TouchableOpacity
              style={[styles.doneButton, (!imageDimensions || isProcessing) && styles.doneButtonDisabled]}
              onPress={handleApply}
              disabled={!imageDimensions || isProcessing}
              activeOpacity={0.7}
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color="#000000" />
              ) : (
                <Text style={styles.doneButtonText}>Done</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  headerButton: {
    width: 80,
    alignItems: 'center',
    paddingVertical: 4,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_600SemiBold',
  },
  cancelText: {
    color: '#888888',
  },
  applyText: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_600SemiBold',
  },
  dimmed: {
    opacity: 0.4,
  },
  imageContainer: {
    overflow: 'hidden',
  },
  overlayRect: {
    position: 'absolute',
    backgroundColor: OVERLAY_COLOR,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomArea: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 16,
    width: '100%',
    alignItems: 'center',
  },
  hintText: {
    color: '#666666',
    textAlign: 'center',
  },
  doneButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
    width: '100%',
    alignItems: 'center',
  },
  doneButtonDisabled: {
    opacity: 0.3,
  },
  doneButtonText: {
    color: '#000000',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 16,
  },
});
