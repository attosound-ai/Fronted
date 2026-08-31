import { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import { msToPixels, pixelsToMs } from '../utils/timelineCalculations';

interface TimelinePlayheadProps {
  /**
   * UI-thread playhead position (ms). The playhead reads this directly inside
   * `useAnimatedStyle`, so the play loop can move it at 60fps WITHOUT a React
   * re-render of the editor tree. (Before, `positionMs` came in as a prop from
   * reducer state, so every playback frame re-rendered every track + waveform.)
   */
  positionSv: SharedValue<number>;
  zoom: number;
  height: number;
  totalDurationMs: number;
  onSeek?: (positionMs: number) => void;
  topOffset?: number;
}

export function TimelinePlayhead({
  positionSv,
  zoom,
  height,
  totalDurationMs,
  onSeek,
  topOffset = 0,
}: TimelinePlayheadProps) {
  // Scrub: pan the cap to seek. Position updates on the UI thread every frame;
  // the JS seek (which pauses playback + commits to the reducer) fires at the
  // same rate but the DRAWING never waits on it.
  const dragStartMs = useSharedValue(0);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .hitSlop({ horizontal: 22 })
        .onBegin(() => {
          dragStartMs.value = positionSv.value;
        })
        .onUpdate((e) => {
          try {
            const startPx = msToPixels(dragStartMs.value, zoom);
            const newMs = Math.max(
              0,
              Math.min(pixelsToMs(startPx + e.translationX, zoom), totalDurationMs)
            );
            positionSv.value = newMs;
            if (onSeek) runOnJS(onSeek)(Math.round(newMs));
          } catch (err) {
            // A scrub glitch must never escalate to a fatal UI-runtime error:
            // build 169 died mid-call from exactly that class of failure.
          }
        }),
    [zoom, totalDurationMs, onSeek, positionSv, dragStartMs]
  );

  const animatedStyle = useAnimatedStyle(() => {
    // try/catch: an error inside a UI-thread style updater is escalated by
    // Hermes to a FATAL C++ exception. This exact worklet killed the app in a
    // live call on build 169 (msToPixels was not yet a worklet). The root cause
    // is fixed at the source; this guard makes the worst case a frozen playhead
    // instead of a dead call.
    try {
      return { transform: [{ translateX: msToPixels(positionSv.value, zoom) }] };
    } catch (err) {
      return { transform: [{ translateX: 0 }] };
    }
  });

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.playhead, { height, top: topOffset }, animatedStyle]}>
        <View style={styles.hitArea}>
          <View style={styles.head} />
        </View>
        <View style={styles.line} />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  playhead: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 1,
    zIndex: 10,
    alignItems: 'center',
  },
  hitArea: {
    width: 44,
    height: 32,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  head: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#EF4444',
  },
  line: {
    flex: 1,
    width: 1,
    backgroundColor: '#EF4444',
  },
});
