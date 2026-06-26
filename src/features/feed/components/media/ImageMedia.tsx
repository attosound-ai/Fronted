import { useRef, useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Animated,
  Pressable,
  FlatList,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { Heart } from 'lucide-react-native';
import type { FeedPost } from '@/types/post';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
/**
 * Height-to-width ratio from the media's native dimensions.
 *
 * The width is always fixed to the feed's content width; the height follows the
 * image's true aspect ratio so uploads render exactly as the creator shot them
 * (no clamping, no cropping). Guards against zero/garbage dimensions.
 */
function heightRatioFor(w: number, h: number): number {
  if (!w || w <= 0 || !h || h <= 0) return 1;
  return h / w;
}

interface ImageMediaProps {
  post: FeedPost;
  onDoubleTap?: () => void;
}

export function ImageMedia({ post, onDoubleTap }: ImageMediaProps) {
  const { contentWidth } = useDeviceLayout();
  const images = post.images ?? [];
  const [activeIndex, setActiveIndex] = useState(0);
  const [heightRatio, setHeightRatio] = useState(() => {
    if (post.mediaWidth && post.mediaHeight && post.mediaWidth > 0) {
      return heightRatioFor(post.mediaWidth, post.mediaHeight);
    }
    return 1; // default 1:1 while loading
  });
  const lastTap = useRef(0);
  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;

  // Detect aspect ratio from first image URL if backend didn't provide dimensions
  const firstImage = images[0];
  useEffect(() => {
    if (post.mediaWidth && post.mediaHeight) return;
    if (!firstImage) return;
    Image.getSize(
      firstImage,
      (w, h) => {
        if (w > 0) setHeightRatio(heightRatioFor(w, h));
      },
      () => {}
    );
  }, [firstImage, post.mediaWidth, post.mediaHeight]);

  const imageHeight = contentWidth * heightRatio;

  const handlePress = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      onDoubleTap?.();
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
    }
    lastTap.current = now;
  }, [onDoubleTap, heartScale, heartOpacity]);

  const onMomentumEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / contentWidth);
    setActiveIndex(index);
  }, []);

  if (images.length === 0) return null;

  const renderImage = ({ item }: { item: string }) => (
    <Pressable onPress={handlePress}>
      <Image
        source={{ uri: item }}
        style={[styles.image, { width: contentWidth, height: imageHeight }]}
        resizeMode="contain"
      />
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={images}
        renderItem={renderImage}
        keyExtractor={(_, i) => i.toString()}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
      />

      {images.length > 1 && (
        <View style={styles.counter}>
          <Text style={styles.counterText}>
            {activeIndex + 1}/{images.length}
          </Text>
        </View>
      )}

      {images.length > 1 && (
        <View style={styles.dots}>
          {images.map((_, i) => (
            <View key={i} style={[styles.dot, i === activeIndex && styles.dotActive]} />
          ))}
        </View>
      )}

      <Animated.View
        style={[
          styles.heartOverlay,
          {
            opacity: heartOpacity,
            transform: [{ scale: heartScale }],
          },
        ]}
        pointerEvents="none"
      >
        <Heart size={80} color="#FFF" fill="#FFF" strokeWidth={2.25} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  image: {
    backgroundColor: '#111',
  },
  counter: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  counterText: {
    color: '#FFF',
    fontSize: 12,
    fontFamily: 'Archivo_500Medium',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#555',
  },
  dotActive: {
    backgroundColor: '#3B82F6',
  },
  heartOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
