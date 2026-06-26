import { type ReactNode } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeaderBlur } from './HeaderBlur';
import { DEFAULT_HEADER_BAR_HEIGHT } from '@/hooks/useCollapsibleHeader';

interface CollapsibleHeaderProps {
  /** From `useCollapsibleHeader().animatedStyle` — drives the hide/reveal. */
  animatedStyle: StyleProp<ViewStyle>;
  /** Bar height below the safe-area inset. Must match the value given to the hook. */
  barHeight?: number;
  /** Optional style overrides for the inner content row. */
  rowStyle?: StyleProp<ViewStyle>;
  /** The screen's existing header content (back button, title, actions). */
  children: ReactNode;
}

/**
 * CollapsibleHeader — a floating, Instagram-style header that hides on
 * scroll-down and reveals on scroll-up, over a frosted gradient blur that
 * fades into the content (see {@link HeaderBlur}).
 *
 * It's a thin WRAPPER: pass your screen's existing header content as children
 * and it gains the float + blur + hide/reveal behaviour. The screen must offset
 * its scroll content by `useCollapsibleHeader().height` so nothing starts hidden
 * behind it.
 *
 * `pointerEvents="box-none"` lets taps fall through the empty/blur areas to the
 * content underneath, while the buttons inside `children` stay tappable.
 */
export function CollapsibleHeader({
  animatedStyle,
  barHeight = DEFAULT_HEADER_BAR_HEIGHT,
  rowStyle,
  children,
}: CollapsibleHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.container,
        { height: insets.top + barHeight, paddingTop: insets.top },
        animatedStyle,
      ]}
    >
      <HeaderBlur />
      <View pointerEvents="box-none" style={[styles.row, rowStyle]}>
        {children}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    // visible (not hidden) so HeaderBlur's fade can spill slightly below the bar.
    overflow: 'visible',
    zIndex: 10,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
});
