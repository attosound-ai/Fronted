import { Animated, StyleSheet } from 'react-native';
import { Heart } from 'lucide-react-native';

interface HeartBurstProps {
  /** Drives the pop scale (from useDoubleTapLike). */
  scale: Animated.Value;
  /** Drives the fade in/out (from useDoubleTapLike). */
  opacity: Animated.Value;
  size?: number;
}

/**
 * HeartBurst — the centered heart that pops on a double-tap "like". Pair with
 * useDoubleTapLike, which owns the animation values. Non-interactive overlay.
 */
export function HeartBurst({ scale, opacity, size = 96 }: HeartBurstProps) {
  return (
    <Animated.View
      style={[styles.container, { opacity, transform: [{ scale }] }]}
      pointerEvents="none"
    >
      <Heart size={size} color="#FFF" fill="#FFF" strokeWidth={2.25} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
