import { useCallback, useEffect, useState } from 'react';
import {
  Image,
  Modal,
  StyleSheet,
  StatusBar,
  View,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import ReAnimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withSequence,
  withDelay,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { X } from 'lucide-react-native';
import { router } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { CreatorBadge } from '@/components/ui/CreatorBadge';
import { LogoVotersSheet } from './LogoVotersSheet';
import { haptic } from '@/lib/haptics/hapticService';

const SPRING_CONFIG = { damping: 20, stiffness: 200 };
const DISMISS_THRESHOLD = 150;

const RATING_EMOJIS = [
  '\u{1F621}',
  '\u{1F614}',
  '\u{1F610}',
  '\u{1F642}',
  '\u{1F601}',
] as const;

export interface LogoItem {
  id: string;
  imageUrl: string;
  rating: number;
  ratingCount: number;
  userRating: number | null;
  creator?: {
    id: string;
    username: string;
    displayName: string;
    avatar: string | null;
  } | null;
}

interface FullscreenImageViewerProps {
  uri: string;
  logo?: LogoItem;
  onVote?: (logoId: string, rating: 1 | 2 | 3 | 4 | 5) => void;
  visible: boolean;
  onClose: () => void;
}

export function FullscreenImageViewer({
  uri,
  logo,
  onVote,
  visible,
  onClose,
}: FullscreenImageViewerProps) {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const [votersSheet, setVotersSheet] = useState<{
    logoId: string;
    ratingFilter: number;
  } | null>(null);

  // Confirmation feedback animation
  const confirmOpacity = useSharedValue(0);
  const confirmScale = useSharedValue(0.5);
  const [confirmEmoji, setConfirmEmoji] = useState('');

  const confirmStyle = useAnimatedStyle(() => ({
    opacity: confirmOpacity.value,
    transform: [{ scale: confirmScale.value }],
  }));

  const handleVote = useCallback(
    (logoId: string, value: 1 | 2 | 3 | 4 | 5) => {
      haptic('success');
      setConfirmEmoji(RATING_EMOJIS[value - 1]);
      confirmScale.value = withSequence(
        withTiming(0.5, { duration: 0 }),
        withSpring(1, { damping: 10, stiffness: 200 })
      );
      confirmOpacity.value = withSequence(
        withTiming(1, { duration: 100 }),
        withDelay(800, withTiming(0, { duration: 400 }))
      );
      onVote?.(logoId, value);
    },
    [onVote, confirmOpacity, confirmScale]
  );

  useEffect(() => {
    if (!visible) return;
    ScreenOrientation.unlockAsync();
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, [visible]);

  // ── Gestures (zoom + dismiss) ──
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);

  const resetAndClose = useCallback(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    scale.value = 1;
    savedScale.value = 1;
    translateY.value = 0;
    opacity.value = 1;
    onClose();
  }, [onClose, scale, savedScale, translateY, opacity]);

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (savedScale.value > 1) return;
      translateY.value = e.translationY;
      const progress = Math.min(Math.abs(e.translationY) / DISMISS_THRESHOLD, 1);
      opacity.value = 1 - progress * 0.5;
    })
    .onEnd((e) => {
      if (savedScale.value > 1) return;
      if (Math.abs(e.translationY) > DISMISS_THRESHOLD || Math.abs(e.velocityY) > 800) {
        opacity.value = withTiming(0, { duration: 150 });
        translateY.value = withTiming(
          e.translationY > 0 ? 600 : -600,
          { duration: 150 },
          () => runOnJS(resetAndClose)()
        );
        return;
      }
      translateY.value = withSpring(0, SPRING_CONFIG);
      opacity.value = withTiming(1, { duration: 150 });
    });

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(0.5, savedScale.value * e.scale);
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withSpring(1, SPRING_CONFIG);
        savedScale.value = 1;
      } else {
        savedScale.value = scale.value;
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withSpring(1, SPRING_CONFIG);
        savedScale.value = 1;
      } else {
        scale.value = withSpring(2.5, SPRING_CONFIG);
        savedScale.value = 2.5;
      }
    });

  const gesture = Gesture.Exclusive(
    doubleTap,
    Gesture.Simultaneous(pinchGesture, panGesture)
  );

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    backgroundColor: `rgba(0, 0, 0, ${opacity.value})`,
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      supportedOrientations={[
        'portrait',
        'landscape',
        'landscape-left',
        'landscape-right',
      ]}
      onRequestClose={resetAndClose}
      statusBarTranslucent
    >
      <StatusBar hidden />

      <GestureDetector gesture={gesture}>
        <ReAnimated.View style={[styles.container, backdropStyle]}>
          {logo ? (
            <ReAnimated.View
              style={[
                styles.logoCard,
                {
                  width: width * 0.86,
                  height: width * 0.86 * 0.5,
                },
                imageStyle,
              ]}
            >
              <Image
                source={{ uri }}
                style={styles.logoCardImage}
                resizeMode="contain"
              />
            </ReAnimated.View>
          ) : (
            <ReAnimated.Image
              source={{ uri }}
              style={[{ width: width * 0.8, height: width * 0.8 * 0.4 }, imageStyle]}
              resizeMode="contain"
            />
          )}
        </ReAnimated.View>
      </GestureDetector>

      {/* Vote confirmation */}
      <ReAnimated.View style={[styles.confirmBubble, confirmStyle]} pointerEvents="none">
        <Text style={styles.confirmEmoji}>{confirmEmoji}</Text>
      </ReAnimated.View>

      {/* Close button */}
      <TouchableOpacity
        style={[styles.closeButton, { top: Math.max(56, height * 0.05) }]}
        onPress={resetAndClose}
        activeOpacity={0.6}
        hitSlop={8}
      >
        <X size={24} color="#fff" strokeWidth={2.25} />
      </TouchableOpacity>

      {/* Creator attribution — positioned top in landscape, inside bottom bar in portrait */}
      {logo?.creator && onVote && isLandscape && (
        <TouchableOpacity
          style={[styles.creatorAttributionTop, { top: Math.max(56, height * 0.08) }]}
          activeOpacity={0.7}
          onPress={() => {
            resetAndClose();
            setTimeout(
              () =>
                router.navigate({
                  pathname: '/user/[id]',
                  params: { id: logo.creator!.id },
                }),
              300
            );
          }}
        >
          <Text style={styles.attributionBy}>Art by </Text>
          <Text style={styles.attributionName}>{logo.creator.username}</Text>
          <CreatorBadge size="sm" />
        </TouchableOpacity>
      )}

      {/* Emoji rating */}
      {logo && onVote && (
        <View style={[styles.bottomBar, { bottom: Math.max(30, height * 0.08) }]}>
          {logo.creator && !isLandscape && (
            <TouchableOpacity
              style={styles.creatorAttribution}
              activeOpacity={0.7}
              onPress={() => {
                resetAndClose();
                setTimeout(
                  () =>
                    router.navigate({
                      pathname: '/user/[id]',
                      params: { id: logo.creator!.id },
                    }),
                  300
                );
              }}
            >
              <Text style={styles.attributionBy}>Art by </Text>
              <Text style={styles.attributionName}>{logo.creator.username}</Text>
              <CreatorBadge size="sm" />
            </TouchableOpacity>
          )}
          <View style={styles.ratingRow}>
            {RATING_EMOJIS.map((emoji, i) => {
              const value = (i + 1) as 1 | 2 | 3 | 4 | 5;
              const isSelected = logo.userRating === value;
              return (
                <TouchableOpacity
                  key={value}
                  style={[styles.emojiButton, isSelected && styles.emojiButtonActive]}
                  onPress={() => handleVote(logo.id, value)}
                  onLongPress={() =>
                    setVotersSheet({ logoId: logo.id, ratingFilter: value })
                  }
                  activeOpacity={0.7}
                >
                  <Text style={styles.emoji}>{emoji}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {logo.ratingCount > 0 && (
            <Text style={styles.ratingLabel}>
              {logo.rating.toFixed(1)} ({logo.ratingCount})
            </Text>
          )}
        </View>
      )}

      {/* Swipe hint (only when no rating UI) */}
      {!logo && (
        <View style={styles.closeHint}>
          <ReAnimated.Text style={[styles.hintText, { opacity }]}>
            Swipe down to close
          </ReAnimated.Text>
        </View>
      )}

      {votersSheet && (
        <LogoVotersSheet
          visible
          logoId={votersSheet.logoId}
          ratingFilter={votersSheet.ratingFilter}
          onClose={() => setVotersSheet(null)}
        />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  logoCardImage: {
    width: '100%',
    height: '100%',
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    gap: 12,
  },
  creatorAttribution: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  creatorAttributionTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 16,
  },
  attributionBy: {
    color: '#888',
    fontFamily: 'Archivo_400Regular',
    fontSize: 13,
  },
  attributionName: {
    color: '#FFF',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 13,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 32,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  emojiButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  emojiButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    transform: [{ scale: 1.15 }],
  },
  emoji: {
    fontSize: 30,
    lineHeight: 38,
  },
  ratingLabel: {
    color: '#aaa',
    fontFamily: 'Archivo_500Medium',
    fontSize: 12,
  },
  confirmBubble: {
    position: 'absolute',
    top: '35%',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 40,
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmEmoji: {
    fontSize: 44,
    lineHeight: 54,
  },
  closeHint: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
    pointerEvents: 'none',
  },
  hintText: {
    color: '#888',
    fontFamily: 'Archivo_400Regular',
    fontSize: 13,
  },
});
