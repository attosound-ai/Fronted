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
import { COLORS } from '@/constants/theme';

/** The cover and the avatar coming in, and leaving. */
const IN_MS = 170;
const OUT_MS = 190;

export function AccountSwitchOverlay() {
  const phase = useAccountSwitchAnimationStore((s) => s.phase);
  const targetUser = useAccountSwitchAnimationStore((s) => s.targetUser);
  const holdFlip = useAccountSwitchAnimationStore((s) => s.holdFlip);
  const reset = useAccountSwitchAnimationStore((s) => s.reset);

  const overlayOpacity = useSharedValue(0);
  const contentOpacity = useSharedValue(0);
  const contentScale = useSharedValue(0.7);

  // The switch itself is now a local swap of some tens of milliseconds, so
  // this animation IS the time a switch takes. It used to run one step after
  // another, 550 ms in and 450 ms out: a second of black screen at best. Now
  // the cover and the avatar move together, IN_MS in and OUT_MS out, long
  // enough to read whose account it is and to hide the screens changing
  // underneath. A switch that does have to wait for the server holds on the
  // avatar until it is done.
  // Phase 1: cover and avatar come in together
  useEffect(() => {
    if (phase === 'flipping') {
      overlayOpacity.value = 0;
      contentOpacity.value = 0;
      contentScale.value = 0.86;

      const timing = { duration: IN_MS, easing: Easing.out(Easing.cubic) };
      overlayOpacity.value = withTiming(1, timing);
      contentOpacity.value = withTiming(1, timing);
      contentScale.value = withTiming(1, timing, () => {
        runOnJS(holdFlip)();
      });
    }
  }, [phase, overlayOpacity, contentOpacity, contentScale, holdFlip]);

  // Phase 2: both leave together, showing the new account
  useEffect(() => {
    if (phase === 'done') {
      const timing = { duration: OUT_MS, easing: Easing.in(Easing.cubic) };
      contentScale.value = withTiming(1.08, timing);
      contentOpacity.value = withTiming(0, timing);
      overlayOpacity.value = withTiming(0, timing, () => {
        runOnJS(reset)();
      });
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
              fallbackText={targetUser.username}
              size="xl"
            />
            <Text style={styles.name}>{targetUser.username}</Text>
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
    backgroundColor: COLORS.background.primary,
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
    // The patched Archivo has EXTENDED descenders (-210→-420, see
    // project_archivo_font_patch). Without an explicit lineHeight the line box is
    // ~1.2×fontSize and clips the tail of descenders (the "g" in "suicideking"
    // was cut off — client feedback). 32 (1.6×) leaves clear room below the
    // baseline. includeFontPadding keeps Android from clipping it too.
    lineHeight: 32,
    includeFontPadding: true,
    textAlignVertical: 'center',
  },
});
