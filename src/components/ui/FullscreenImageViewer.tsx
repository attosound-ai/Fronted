import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  StyleSheet,
  StatusBar,
  View,
  FlatList,
  TouchableOpacity,
  useWindowDimensions,
  type ViewToken,
} from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import ReAnimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { ChevronLeft, ChevronRight, ThumbsUp, ThumbsDown, X } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { LogoVotersSheet } from './LogoVotersSheet';

const SPRING_CONFIG = { damping: 20, stiffness: 200 };
const DISMISS_THRESHOLD = 150;

export interface LogoItem {
  id: string;
  imageUrl: string;
  likes: number;
  dislikes: number;
  userVote: number | null;
}

interface FullscreenImageViewerProps {
  uri: string | string[];
  logos?: LogoItem[];
  onVote?: (logoId: string, vote: 1 | -1) => void;
  visible: boolean;
  onClose: () => void;
}

export function FullscreenImageViewer({
  uri,
  logos,
  onVote,
  visible,
  onClose,
}: FullscreenImageViewerProps) {
  const uris = typeof uri === 'string' ? [uri] : uri;
  const isCarousel = uris.length > 1;

  const { width, height } = useWindowDimensions();
  const imageSize = Math.min(width, height) * 0.85;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [votersSheet, setVotersSheet] = useState<{
    logoId: string;
    type: 'likes' | 'dislikes';
  } | null>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!visible) return;
    setCurrentIndex(0);
    ScreenOrientation.unlockAsync();
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, [visible]);

  // ── Single image gestures (zoom + dismiss) ──
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

  const singleGesture = Gesture.Exclusive(
    doubleTap,
    Gesture.Simultaneous(pinchGesture, panGesture)
  );

  const singleImageStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    backgroundColor: `rgba(0, 0, 0, ${opacity.value})`,
  }));

  // ── Carousel: FlatList callbacks ──
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    }
  );
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 });

  const navigateNext = useCallback(() => {
    if (currentIndex >= uris.length - 1) return;
    flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
  }, [currentIndex, uris.length]);

  const navigatePrev = useCallback(() => {
    if (currentIndex <= 0) return;
    flatListRef.current?.scrollToIndex({ index: currentIndex - 1, animated: true });
  }, [currentIndex]);

  const canGoLeft = isCarousel && currentIndex > 0;
  const canGoRight = isCarousel && currentIndex < uris.length - 1;

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

      {isCarousel ? (
        /* ── Carousel mode: native FlatList paging ── */
        <View style={styles.container}>
          <FlatList
            ref={flatListRef}
            data={uris}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(_, i) => String(i)}
            onViewableItemsChanged={onViewableItemsChanged.current}
            viewabilityConfig={viewabilityConfig.current}
            getItemLayout={(_, index) => ({
              length: width,
              offset: width * index,
              index,
            })}
            renderItem={({ item }) => (
              <View style={[styles.slide, { width, height }]}>
                <ReAnimated.Image
                  source={{ uri: item }}
                  style={{ width: width * 0.8, height: width * 0.8 * 0.4 }}
                  resizeMode="contain"
                />
              </View>
            )}
          />
        </View>
      ) : (
        /* ── Single image mode: gestures ── */
        <GestureDetector gesture={singleGesture}>
          <ReAnimated.View style={[styles.container, backdropStyle]}>
            <ReAnimated.Image
              source={{ uri: uris[0] }}
              style={[
                { width: width * 0.7, height: width * 0.7 * 0.4 },
                singleImageStyle,
              ]}
              resizeMode="contain"
            />
          </ReAnimated.View>
        </GestureDetector>
      )}

      {/* Close button */}
      <TouchableOpacity
        style={[styles.closeButton, { top: Math.max(56, height * 0.05) }]}
        onPress={resetAndClose}
        activeOpacity={0.6}
        hitSlop={8}
      >
        <X size={24} color="#fff" strokeWidth={2.25} />
      </TouchableOpacity>

      {/* Bottom bar: ← 👍count · · · · 👎count → */}
      {isCarousel &&
        (() => {
          const logo = logos?.[currentIndex];
          return (
            <View style={[styles.bottomBar, { bottom: Math.max(30, height * 0.08) }]}>
              <TouchableOpacity
                onPress={navigatePrev}
                activeOpacity={0.6}
                style={[styles.arrow, !canGoLeft && styles.arrowHidden]}
                disabled={!canGoLeft}
              >
                <ChevronLeft size={24} color="#fff" strokeWidth={2} />
              </TouchableOpacity>

              {logo && onVote && (
                <TouchableOpacity
                  style={[
                    styles.voteButton,
                    logo.userVote === 1 && styles.voteButtonActive,
                  ]}
                  onPress={() => onVote(logo.id, 1)}
                  onLongPress={() => setVotersSheet({ logoId: logo.id, type: 'likes' })}
                  activeOpacity={0.7}
                >
                  <ThumbsUp
                    size={18}
                    color={logo.userVote === 1 ? '#000' : '#fff'}
                    strokeWidth={2.25}
                  />
                  <Text
                    style={[
                      styles.voteCount,
                      logo.userVote === 1 && styles.voteCountActive,
                    ]}
                  >
                    {logo.likes}
                  </Text>
                </TouchableOpacity>
              )}

              <View style={styles.dots}>
                {uris.map((_, i) => (
                  <View
                    key={i}
                    style={[styles.dot, i === currentIndex && styles.dotActive]}
                  />
                ))}
              </View>

              {logo && onVote && (
                <TouchableOpacity
                  style={[
                    styles.voteButton,
                    logo.userVote === -1 && styles.voteButtonDislike,
                  ]}
                  onPress={() => onVote(logo.id, -1)}
                  onLongPress={() =>
                    setVotersSheet({ logoId: logo.id, type: 'dislikes' })
                  }
                  activeOpacity={0.7}
                >
                  <ThumbsDown
                    size={18}
                    color={logo.userVote === -1 ? '#000' : '#fff'}
                    strokeWidth={2.25}
                  />
                  <Text
                    style={[
                      styles.voteCount,
                      logo.userVote === -1 && styles.voteCountActive,
                    ]}
                  >
                    {logo.dislikes}
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={navigateNext}
                activeOpacity={0.6}
                style={[styles.arrow, !canGoRight && styles.arrowHidden]}
                disabled={!canGoRight}
              >
                <ChevronRight size={24} color="#fff" strokeWidth={2} />
              </TouchableOpacity>
            </View>
          );
        })()}

      {/* Hint */}
      {!isCarousel && (
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
          type={votersSheet.type}
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
  },
  slide: {
    justifyContent: 'center',
    alignItems: 'center',
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  arrow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowHidden: {
    opacity: 0,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#555',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  voteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  voteButtonActive: {
    backgroundColor: '#fff',
  },
  voteButtonDislike: {
    backgroundColor: '#EF4444',
  },
  voteCount: {
    color: '#fff',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 14,
  },
  voteCountActive: {
    color: '#000',
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
