import { useEffect } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { CounterBadge } from '@/components/ui/CounterBadge';
import { GlassSurface } from './GlassSurface';
import { FLOATING_PILL_BOTTOM_GAP } from './navbarMetrics';
import { useScrollOffset } from '@/contexts/ScrollOffsetContext';

/**
 * BottomTabBar — floating Liquid Glass pill (Instagram / iOS-26 style).
 *
 * - Compact: each tab has a FIXED width so the icons sit close together and the
 *   pill hugs its content (instead of stretching edge-to-edge).
 * - Capsule: the glass is rounded natively (no hairline border) so the corners
 *   stay smooth and continuous.
 * - Selection bubble: a single translucent pill SLIDES with a spring from the
 *   old tab to the new one on every section change (no hard cut).
 * - Collapses slightly on scroll-down via the shared `collapsed` value.
 */

const TAB_WIDTH = 66;
const ROW_PADDING_H = 6;
const ROW_PADDING_V = 7;
const BAR_HEIGHT = 52;
const PILL_RADIUS = BAR_HEIGHT / 2;

const BUBBLE_WIDTH = 46;
const BUBBLE_HEIGHT = 38;
// Resting offset that centres the bubble inside a tab; the animated translateX
// then moves it by whole tab widths to the active index.
const BUBBLE_LEFT = ROW_PADDING_H + (TAB_WIDTH - BUBBLE_WIDTH) / 2;

const BUBBLE_SPRING = { damping: 18, stiffness: 200, mass: 0.7 };

export function BottomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { collapsed } = useScrollOffset();

  // Sliding selection bubble — animate its X to the active tab on every change.
  const bubbleX = useSharedValue(state.index * TAB_WIDTH);
  useEffect(() => {
    bubbleX.value = withSpring(state.index * TAB_WIDTH, BUBBLE_SPRING);
  }, [state.index, bubbleX]);

  const bubbleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: bubbleX.value }],
  }));

  const collapseStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(collapsed.value, [0, 1], [1, 0.92], Extrapolation.CLAMP) },
      { translateY: interpolate(collapsed.value, [0, 1], [0, 6], Extrapolation.CLAMP) },
    ],
    opacity: interpolate(collapsed.value, [0, 1], [1, 0.95], Extrapolation.CLAMP),
  }));

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrapper,
        { bottom: Math.max(insets.bottom - 14, FLOATING_PILL_BOTTOM_GAP) },
        collapseStyle,
      ]}
    >
      <View style={styles.pill}>
        {/* Rounded glass background (clipped natively — no border). */}
        <GlassSurface style={StyleSheet.absoluteFill} radius={PILL_RADIUS} />

        {/* The single selection bubble, behind the icons. */}
        <Animated.View pointerEvents="none" style={[styles.bubble, bubbleStyle]} />

        <View style={styles.row}>
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const focused = state.index === index;
            const color = focused ? '#FFFFFF' : '#888888';

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            };

            const onLongPress = () => {
              navigation.emit({ type: 'tabLongPress', target: route.key });
            };

            const icon = options.tabBarIcon?.({ color, focused, size: 26 });
            const badge = options.tabBarBadge;
            const TabButton = options.tabBarButton;

            const content = (
              <View style={styles.item}>
                {icon}
                {badge != null && (
                  <CounterBadge
                    count={badge}
                    style={[
                      styles.badge,
                      options.tabBarBadgeStyle as StyleProp<ViewStyle>,
                    ]}
                  />
                )}
              </View>
            );

            if (TabButton) {
              return (
                <TabButton key={route.key} onPress={onPress} style={styles.tab}>
                  {content}
                </TabButton>
              );
            }

            return (
              <Pressable
                key={route.key}
                onPress={onPress}
                onLongPress={onLongPress}
                style={styles.tab}
              >
                {content}
              </Pressable>
            );
          })}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Full-width, content-centered so the compact pill floats in the middle.
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  // The pill hugs the row. Shadow lives here; corners are rounded for the
  // shadow shape while the glass child does the visual clipping.
  pill: {
    borderRadius: PILL_RADIUS,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: BAR_HEIGHT,
    paddingHorizontal: ROW_PADDING_H,
    paddingVertical: ROW_PADDING_V,
  },
  tab: {
    width: TAB_WIDTH,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  item: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    position: 'absolute',
    left: BUBBLE_LEFT,
    top: (BAR_HEIGHT - BUBBLE_HEIGHT) / 2,
    width: BUBBLE_WIDTH,
    height: BUBBLE_HEIGHT,
    borderRadius: BUBBLE_HEIGHT / 2,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 10,
  },
});
