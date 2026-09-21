import { memo, useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { haptic } from '@/lib/haptics/hapticService';
import { makeRandom, seedFromId, type BubbleEffectName } from './effectCatalog';

interface BubbleEffectProps {
  name: BubbleEffectName;
  messageId: string;
  /** False while the effect has already played: render the bubble plain. */
  play: boolean;
  children: ReactNode;
}

const EASE_OUT = Easing.out(Easing.cubic);

/**
 * Bubble effects, the four iMessage sends: Slam, Loud, Gentle and Invisible
 * Ink. Everything runs on the UI thread; when `play` is false the children
 * render untouched (an effect never plays twice on its own).
 */
function BubbleEffectInner({ name, messageId, play, children }: BubbleEffectProps) {
  const scale = useSharedValue(1);
  const rotate = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (!play || name === 'invisible') return;
    analytics.capture(ANALYTICS_EVENTS.MESSAGES.EFFECT_PLAYED, {
      kind: 'bubble',
      name,
      message_id: messageId,
    });
    if (name === 'slam') {
      // Drops in from far above the screen plane and lands hard.
      opacity.value = 0;
      scale.value = 3.2;
      rotate.value = -8;
      opacity.value = withTiming(1, { duration: 120 });
      rotate.value = withSequence(
        withTiming(2, { duration: 200, easing: EASE_OUT }),
        withSpring(0, { damping: 6, stiffness: 240 })
      );
      scale.value = withSequence(
        withTiming(0.86, { duration: 220, easing: Easing.in(Easing.cubic) }),
        withSpring(1, { damping: 7, stiffness: 320, mass: 0.7 })
      );
      void haptic('heavy');
    } else if (name === 'loud') {
      // Grows huge, shakes, then settles.
      scale.value = withSequence(
        withTiming(1.45, { duration: 260, easing: EASE_OUT }),
        withTiming(1.35, { duration: 420 }),
        withSpring(1, { damping: 9, stiffness: 260 })
      );
      rotate.value = withSequence(
        withRepeat(withTiming(2.5, { duration: 70 }), 8, true),
        withTiming(0, { duration: 120 })
      );
      void haptic('heavy');
    } else if (name === 'gentle') {
      // Arrives tiny and unfolds slowly.
      scale.value = 0.28;
      opacity.value = 0.4;
      scale.value = withDelay(120, withTiming(1, { duration: 900, easing: EASE_OUT }));
      opacity.value = withDelay(120, withTiming(1, { duration: 700 }));
      void haptic('light');
    }
  }, [play, name, messageId, scale, rotate, opacity]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
    opacity: opacity.value,
  }));

  if (name === 'invisible') {
    return (
      <InvisibleInk messageId={messageId} startHidden={play}>
        {children}
      </InvisibleInk>
    );
  }

  return <Animated.View style={style}>{children}</Animated.View>;
}

export const BubbleEffect = memo(BubbleEffectInner);

const INK_DOTS = 90;

/**
 * Invisible ink: the bubble is buried under drifting specks until it is
 * tapped. Reveal is per device and lasts as long as the screen is open,
 * the way iMessage behaves while you stay in the conversation.
 */
function InvisibleInk({
  messageId,
  startHidden,
  children,
}: {
  messageId: string;
  startHidden: boolean;
  children: ReactNode;
}) {
  const [hidden, setHidden] = useState(startHidden);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const reveal = useSharedValue(startHidden ? 0 : 1);

  const dots = renderInkDots(messageId, size, hidden);

  const onReveal = useCallback(() => {
    if (!hidden) return;
    void haptic('light');
    analytics.capture(ANALYTICS_EVENTS.MESSAGES.INVISIBLE_INK_REVEALED, {
      message_id: messageId,
    });
    reveal.value = withTiming(1, { duration: 520, easing: EASE_OUT });
    setTimeout(() => setHidden(false), 520);
  }, [hidden, messageId, reveal]);

  const contentStyle = useAnimatedStyle(() => ({ opacity: reveal.value }));
  const inkStyle = useAnimatedStyle(() => ({ opacity: 1 - reveal.value }));

  return (
    <Pressable
      onPress={onReveal}
      disabled={!hidden}
      onLayout={(e) =>
        setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
      }
      accessibilityRole={hidden ? 'button' : undefined}
    >
      <Animated.View style={contentStyle}>{children}</Animated.View>
      {hidden ? (
        <Animated.View style={[StyleSheet.absoluteFill, inkStyle]} pointerEvents="none">
          {dots}
        </Animated.View>
      ) : null}
    </Pressable>
  );
}

/** The drifting specks, laid out over the measured bubble. */
function renderInkDots(
  messageId: string,
  size: { w: number; h: number },
  hidden: boolean
): ReactNode {
  if (!hidden || size.w <= 0) return null;
  const rand = makeRandom(seedFromId(messageId));
  return (
    <View style={styles.ink}>
      {Array.from({ length: INK_DOTS }, (_, i) => {
        const left = rand() * size.w;
        const top = rand() * size.h;
        const delay = rand() * 1400;
        return (
          <InkDot key={i} left={left} top={top} delay={delay} size={1 + rand() * 1.6} />
        );
      })}
    </View>
  );
}

function InkDot({
  left,
  top,
  delay,
  size,
}: {
  left: number;
  top: number;
  delay: number;
  size: number;
}) {
  const flicker = useSharedValue(0.2);
  useEffect(() => {
    flicker.value = withDelay(
      delay,
      withRepeat(withTiming(0.95, { duration: 700 }), -1, true)
    );
  }, [delay, flicker]);
  const style = useAnimatedStyle(() => ({ opacity: flicker.value }));
  return (
    <Animated.View
      style={[
        styles.dot,
        { left, top, width: size, height: size, borderRadius: size / 2 },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  ink: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1C1C1E',
    borderRadius: 18,
    overflow: 'hidden',
  },
  dot: { position: 'absolute', backgroundColor: '#C9C9CE' },
});
