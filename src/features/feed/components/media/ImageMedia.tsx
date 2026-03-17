import { useRef, useCallback, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import type { FeedPost } from '@/types/post';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ImageMediaProps {
  post: FeedPost;
  onDoubleTap?: () => void;
}

export function ImageMedia({ post, onDoubleTap }: ImageMediaProps) {
  const images = post.images ?? [];
  const [activeIndex, setActiveIndex] = useState(0);
  const lastTap = useRef(0);
  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;

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
      <Image source={{ uri: item }} style={styles.image} resizeMode="cover" />
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
        <Ionicons name="heart" size={80} color="#FFF" />
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
    height: SCREEN_WIDTH * 1.25,
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
