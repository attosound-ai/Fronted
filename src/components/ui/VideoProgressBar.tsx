import { View, Text, StyleSheet } from 'react-native';

import { formatVideoTime } from '@/hooks/useVideoProgress';

interface VideoProgressBarProps {
  /** Current playback position, in seconds. */
  position: number;
  /** Total duration, in seconds. */
  duration: number;
  /** Show the `current / total` readout in the bottom-left corner. */
  showTime?: boolean;
}

/**
 * VideoProgressBar — a thin scrub line pinned to the bottom edge of a video,
 * plus an optional `current / total` time readout in the bottom-left corner.
 *
 * Non-interactive (display only). Render it on top of the VideoView/poster.
 */
export function VideoProgressBar({
  position,
  duration,
  showTime = true,
}: VideoProgressBarProps) {
  const pct = duration > 0 ? Math.min(Math.max(position / duration, 0), 1) : 0;

  return (
    <View style={styles.overlay} pointerEvents="none">
      {showTime && duration > 0 && (
        <Text style={styles.time} allowFontScaling={false}>
          {formatVideoTime(position)} / {formatVideoTime(duration)}
        </Text>
      )}
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  time: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    color: '#FFF',
    fontSize: 12,
    fontFamily: 'Archivo_600SemiBold',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  track: {
    height: 2.5,
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  fill: {
    height: '100%',
    backgroundColor: '#FFF',
  },
});
