import { useRef, useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Dimensions,
  Animated,
  Pressable,
  FlatList,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { Heart } from 'lucide-react-native';
import type { FeedPost } from '@/types/post';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MIN_HEIGHT_RATIO = 0.5625; // 16:9 landscape
const MAX_HEIGHT_RATIO = 1.25; // 4:5 portrait

function clampRatio(w: number, h: number): number {
  return Math.min(MAX_HEIGHT_RATIO, Math.max(MIN_HEIGHT_RATIO, h / w));
}

interface ImageMediaProps {
  post: FeedPost;
  onDoubleTap?: () => void;
}

export function ImageMedia({ post, onDoubleTap }: ImageMediaProps) {
  const images = post.images ?? [];
  const [activeIndex, setActiveIndex] = useState(0);
  const [heightRatio, setHeightRatio] = useState(() => {
    if (post.mediaWidth && post.mediaHeight && post.mediaWidth > 0) {
      return clampRatio(post.mediaWidth, post.mediaHeight);
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
        if (w > 0) setHeightRatio(clampRatio(w, h));
      },
      () => {},
    );
  }, [firstImage, post.mediaWidth, post.mediaHeight]);

  const imageHeight = SCREEN_WIDTH * heightRatio;

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
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setActiveIndex(index);
  }, []);

  if (images.length === 0) return null;

  const renderImage = ({ item }: { item: string }) => (
    <Pressable onPress={handlePress}>
      <Image
        source={{ uri: item }}
        style={[styles.image, { height: imageHeight }]}
        resizeMode="cover"
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
    width: SCREEN_WIDTH,
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
