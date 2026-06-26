/**
 * ScrollOffsetContext — shared "navbar collapse" progress for the floating
 * Liquid Glass bottom navbar.
 *
 * A single Reanimated shared value (`collapsed`: 0 = expanded, 1 = slightly
 * shrunk) is created once, ABOVE the lazy tab screens (mounted in
 * (tabs)/_layout). Each tab list drives it through `scrollHandler`, and
 * BottomTabBar reads it via useAnimatedStyle to shrink the pill on scroll-down /
 * expand on scroll-up — the Instagram feel.
 *
 * `scrollHandler` is a PLAIN JS onScroll callback (not a Reanimated worklet
 * handler) so it can attach to any regular FlatList/ScrollView. It only writes
 * `collapsed.value`; the actual animation runs on the UI thread via withTiming.
 *
 * Consumers outside the provider (e.g. the iPad SidebarTabBar) get a safe no-op
 * default so they never crash.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import {
  makeMutable,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

type ScrollHandler = (e: NativeSyntheticEvent<NativeScrollEvent>) => void;

interface ScrollOffsetValue {
  /** 0 = expanded, 1 = slightly shrunk. */
  collapsed: SharedValue<number>;
  /** Attach to a list's `onScroll` (keep scrollEventThrottle={16}). */
  scrollHandler: ScrollHandler;
  /** Force the navbar back to full size (e.g. on scroll-to-top). */
  expand: () => void;
}

// Top of the list is always "expanded" (Instagram resets the bar at the top).
const TOP_THRESHOLD = 8;
// Ignore tiny jitters; only react to a deliberate scroll in a direction.
const DELTA_THRESHOLD = 12;
const TIMING = { duration: 120 };

const ScrollOffsetContext = createContext<ScrollOffsetValue | null>(null);

// Module-level no-op fallback for consumers rendered outside the provider.
const NOOP_COLLAPSED = makeMutable(0);
const NOOP_VALUE: ScrollOffsetValue = {
  collapsed: NOOP_COLLAPSED,
  scrollHandler: () => {},
  expand: () => {},
};

export function ScrollOffsetProvider({ children }: { children: ReactNode }) {
  const collapsed = useSharedValue(0);
  const lastY = useRef(0);
  const target = useRef(0);

  // Only animate when the target actually changes — avoids restarting the
  // timing on every scroll frame during a fling.
  const setTarget = useCallback(
    (next: number) => {
      if (next !== target.current) {
        target.current = next;
        collapsed.value = withTiming(next, TIMING);
      }
    },
    [collapsed]
  );

  const scrollHandler = useCallback<ScrollHandler>(
    (e) => {
      const y = e.nativeEvent.contentOffset.y;
      const delta = y - lastY.current;
      lastY.current = y;

      if (y <= TOP_THRESHOLD) setTarget(0);
      else if (delta > DELTA_THRESHOLD)
        setTarget(1); // scrolling down → shrink
      else if (delta < -DELTA_THRESHOLD) setTarget(0); // scrolling up → expand
    },
    [setTarget]
  );

  const expand = useCallback(() => setTarget(0), [setTarget]);

  const value = useMemo<ScrollOffsetValue>(
    () => ({ collapsed, scrollHandler, expand }),
    [collapsed, scrollHandler, expand]
  );

  return (
    <ScrollOffsetContext.Provider value={value}>{children}</ScrollOffsetContext.Provider>
  );
}

export function useScrollOffset(): ScrollOffsetValue {
  return useContext(ScrollOffsetContext) ?? NOOP_VALUE;
}
