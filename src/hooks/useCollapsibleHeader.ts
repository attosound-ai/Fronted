import { useCallback, useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useScrollOffset } from '@/contexts/ScrollOffsetContext';

/**
 * useCollapsibleHeader — Instagram-style hide-on-scroll header, usable on ANY
 * scrollable screen (inside or outside the tabs ScrollOffsetProvider).
 *
 * It keeps its OWN local `collapsed` value (0 = shown, 1 = hidden) so it works
 * everywhere, and ALSO forwards scroll to the global navbar collapse — which is
 * a no-op on non-tab screens (where `useScrollOffset` returns its default), so
 * the floating bottom navbar keeps collapsing in sync on tab screens for free.
 *
 * Wire it up:
 *   const header = useCollapsibleHeader();
 *   <CollapsibleHeader animatedStyle={header.animatedStyle} barHeight={header.barHeight}>
 *     ...existing header content...
 *   </CollapsibleHeader>
 *   <FlatList
 *     onScroll={header.onScroll}
 *     scrollEventThrottle={header.scrollEventThrottle}
 *     contentContainerStyle={{ paddingTop: header.height }}
 *   />
 */

// Top of the list is always "shown" (matches Instagram resetting at the top).
const TOP_THRESHOLD = 8;
// Ignore tiny jitters; only react to a deliberate scroll in a direction.
const DELTA_THRESHOLD = 12;
const TIMING = { duration: 120 };

/** Default header bar height BELOW the safe-area inset (back + title row). */
export const DEFAULT_HEADER_BAR_HEIGHT = 48;

export function useCollapsibleHeader(barHeight: number = DEFAULT_HEADER_BAR_HEIGHT) {
  const insets = useSafeAreaInsets();
  // Also collapses the floating bottom navbar on tab screens; no-op elsewhere.
  const { scrollHandler: navbarHandler } = useScrollOffset();

  const collapsed = useSharedValue(0);
  const lastY = useRef(0);
  const target = useRef(0);

  const setTarget = useCallback(
    (next: number) => {
      if (next !== target.current) {
        target.current = next;
        collapsed.value = withTiming(next, TIMING);
      }
    },
    [collapsed]
  );

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const delta = y - lastY.current;
      lastY.current = y;

      if (y <= TOP_THRESHOLD) setTarget(0);
      else if (delta > DELTA_THRESHOLD)
        setTarget(1); // scrolling down → hide
      else if (delta < -DELTA_THRESHOLD) setTarget(0); // scrolling up → show

      navbarHandler(e);
    },
    [setTarget, navbarHandler]
  );

  // Full overlay height incl. the safe-area inset, so it slides fully away.
  const height = insets.top + barHeight;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          collapsed.value,
          [0, 1],
          [0, -height],
          Extrapolation.CLAMP
        ),
      },
    ],
    opacity: interpolate(collapsed.value, [0, 1], [1, 0], Extrapolation.CLAMP),
  }));

  return {
    /** Attach to the scroll view's `onScroll`. */
    onScroll,
    scrollEventThrottle: 16,
    /** Pass to <CollapsibleHeader animatedStyle={...} />. */
    animatedStyle,
    /** Bar height below the inset — pass the same value to <CollapsibleHeader />. */
    barHeight,
    /** Full header height (inset + bar) — use as the scroll content's paddingTop. */
    height,
  };
}
