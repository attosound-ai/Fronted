import { useRef } from 'react';
import { Animated, PanResponder, StyleSheet, Dimensions } from 'react-native';
import { usePathname } from 'expo-router';
import * as Sentry from '@sentry/react-native';

// Routes where the bug report FAB would cover critical UI. Matched as a
// startsWith against the current pathname.
const HIDDEN_ROUTE_PREFIXES = ['/project/', '/call', '/(tabs)/recording'];

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const FAB_SIZE = 48;
const EDGE_MARGIN = 16;

export function BugReportFAB() {
  const pathname = usePathname();
  const isHidden = HIDDEN_ROUTE_PREFIXES.some((prefix) => pathname?.startsWith(prefix));

  const pan = useRef(
    new Animated.ValueXY({ x: SCREEN_W - FAB_SIZE - EDGE_MARGIN, y: SCREEN_H - 180 })
  ).current;
  const lastOffset = useRef({ x: SCREEN_W - FAB_SIZE - EDGE_MARGIN, y: SCREEN_H - 180 });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
      onPanResponderGrant: () => {
        pan.setOffset(lastOffset.current);
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_, g) => {
        pan.flattenOffset();

        const rawX = lastOffset.current.x + g.dx;
        const rawY = lastOffset.current.y + g.dy;

        // Snap to nearest horizontal edge
        const snapX =
          rawX < SCREEN_W / 2 ? EDGE_MARGIN : SCREEN_W - FAB_SIZE - EDGE_MARGIN;
        // Clamp Y within screen bounds
        const clampedY = Math.max(
          EDGE_MARGIN + 50,
          Math.min(rawY, SCREEN_H - FAB_SIZE - 100)
        );

        lastOffset.current = { x: snapX, y: clampedY };

        Animated.spring(pan, {
          toValue: { x: snapX, y: clampedY },
          useNativeDriver: false,
          friction: 7,
        }).start();
      },
    })
  ).current;

  const handlePress = () => {
    Sentry.showFeedbackWidget();
  };

  if (isHidden) return null;

  return (
    <Animated.View
      style={[styles.fab, { left: pan.x, top: pan.y }]}
      {...panResponder.panHandlers}
    >
      <Animated.Text style={styles.icon} onPress={handlePress} allowFontScaling={false}>
        💬
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: '#8B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    elevation: 10,
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  icon: {
    fontSize: 22,
  },
});
