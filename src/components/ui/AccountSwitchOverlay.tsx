import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { useAccountSwitchAnimationStore } from '@/stores/accountSwitchAnimationStore';
import { Avatar } from './Avatar';
import { Text } from './Text';

export function AccountSwitchOverlay() {
  const phase = useAccountSwitchAnimationStore((s) => s.phase);
  const targetUser = useAccountSwitchAnimationStore((s) => s.targetUser);
  const holdFlip = useAccountSwitchAnimationStore((s) => s.holdFlip);
  const reset = useAccountSwitchAnimationStore((s) => s.reset);

  const overlayOpacity = useSharedValue(0);
  const contentOpacity = useSharedValue(0);
  const contentScale = useSharedValue(0.7);

  // Phase 1: Fade in overlay → reveal avatar with scale-up
  useEffect(() => {
    if (phase === 'flipping') {
      overlayOpacity.value = 0;
      contentOpacity.value = 0;
      contentScale.value = 0.7;

      overlayOpacity.value = withTiming(
        1,
        { duration: 300, easing: Easing.out(Easing.cubic) },
        () => {
          // Overlay opaque — animate avatar in
          contentOpacity.value = withTiming(1, {
            duration: 250,
            easing: Easing.out(Easing.cubic),
          });
          contentScale.value = withTiming(
            1,
            { duration: 250, easing: Easing.out(Easing.cubic) },
            () => {
              runOnJS(holdFlip)();
            }
          );
        }
      );
    }
  }, [phase, overlayOpacity, contentOpacity, contentScale, holdFlip]);

  // Phase 2: Avatar zooms out + overlay fades revealing new content
  useEffect(() => {
    if (phase === 'done') {
      contentScale.value = withTiming(1.15, {
        duration: 200,
        easing: Easing.in(Easing.cubic),
      });
      contentOpacity.value = withTiming(
        0,
        { duration: 200, easing: Easing.in(Easing.cubic) },
        () => {
          overlayOpacity.value = withTiming(
            0,
            { duration: 250, easing: Easing.in(Easing.cubic) },
            () => {
              runOnJS(reset)();
            }
          );
        }
      );
    }
  }, [phase, overlayOpacity, contentOpacity, contentScale, reset]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ scale: contentScale.value }],
  }));

  if (phase === 'idle') return null;

  return (
    <Animated.View style={[styles.container, overlayStyle]} pointerEvents="auto">
      <Animated.View style={[styles.content, contentStyle]}>
        {targetUser && (
          <>
            <Avatar
              uri={targetUser.avatar}
              fallbackText={targetUser.displayName}
              size="xl"
            />
            <Text style={styles.name}>{targetUser.displayName}</Text>
          </>
        )}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  name: {
    color: '#FFFFFF',
    fontSize: 20,
    fontFamily: 'Archivo_600SemiBold',
  },
});
