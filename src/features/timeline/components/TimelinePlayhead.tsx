import { useRef } from 'react';
import { View, StyleSheet, PanResponder } from 'react-native';
import { msToPixels, pixelsToMs } from '../utils/timelineCalculations';

interface TimelinePlayheadProps {
  positionMs: number;
  zoom: number;
  height: number;
  totalDurationMs: number;
  onSeek?: (positionMs: number) => void;
  topOffset?: number;
}

export function TimelinePlayhead({
  positionMs,
  zoom,
  height,
  totalDurationMs,
  onSeek,
  topOffset = 0,
}: TimelinePlayheadProps) {
  const left = msToPixels(positionMs, zoom);

  // Use refs to avoid stale closures in PanResponder
  const posRef = useRef(positionMs);
  posRef.current = positionMs;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const totalDurationRef = useRef(totalDurationMs);
  totalDurationRef.current = totalDurationMs;
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => {
        if (!onSeekRef.current) return;
        const currentPx = msToPixels(posRef.current, zoomRef.current);
        const newPx = currentPx + g.dx;
        const newMs = Math.max(
          0,
          Math.min(pixelsToMs(newPx, zoomRef.current), totalDurationRef.current)
        );
        onSeekRef.current(Math.round(newMs));
      },
      onPanResponderRelease: () => {},
    })
  ).current;

  return (
    <View
      style={[styles.playhead, { left, height, top: topOffset }]}
      {...panResponder.panHandlers}
    >
      <View style={styles.hitArea}>
        <View style={styles.head} />
      </View>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  playhead: {
    position: 'absolute',
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
