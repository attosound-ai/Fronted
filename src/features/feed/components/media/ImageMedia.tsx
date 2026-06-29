import { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Pressable,
  FlatList,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import type { FeedPost } from '@/types/post';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import { useDoubleTapLike } from '../../hooks/useDoubleTapLike';
import { HeartBurst } from './HeartBurst';
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
  // Double-tap anywhere on the image → like + heart burst + haptic (shared with
  // every other feed media surface).
  const { handleTap, heartScale, heartOpacity } = useDoubleTapLike({ onDoubleTap });

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

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(e.nativeEvent.contentOffset.x / contentWidth);
      setActiveIndex(index);
    },
    [contentWidth]
  );

  if (images.length === 0) return null;

  const renderImage = ({ item }: { item: string }) => (
    <Pressable onPress={handleTap}>
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

      <HeartBurst scale={heartScale} opacity={heartOpacity} size={80} />
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
});
