import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from '@/components/ui/Text';
import { msToPixels, generateRulerMarks } from '../utils/timelineCalculations';

interface TimelineRulerProps {
  totalDurationMs: number;
  zoom: number;
  onSeek: (positionMs: number) => void;
}

export function TimelineRuler({ totalDurationMs, zoom, onSeek }: TimelineRulerProps) {
  const marks = generateRulerMarks(totalDurationMs + 5000, zoom);
  const totalWidth = msToPixels(totalDurationMs + 5000, zoom);

  const handlePress = (e: { nativeEvent: { locationX: number } }) => {
    const ms = e.nativeEvent.locationX / (0.1 * zoom);
    onSeek(Math.round(Math.max(0, Math.min(totalDurationMs, ms))));
  };

  return (
    <Pressable onPress={handlePress}>
      <View style={[styles.container, { width: totalWidth }]}>
        {marks.map((mark) => (
          <View
            key={mark.positionMs}
            style={[styles.mark, { left: msToPixels(mark.positionMs, zoom) }]}
          >
            <View style={mark.isMajor ? styles.majorTick : styles.minorTick} />
            {mark.label !== '' && (
              <Text variant="caption" style={styles.label}>
                {mark.label}
              </Text>
            )}
          </View>
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 28,
    backgroundColor: '#0a0a0a',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  mark: {
    position: 'absolute',
    top: 0,
    alignItems: 'center',
  },
  majorTick: {
    width: 1,
    height: 10,
    backgroundColor: '#555',
  },
  minorTick: {
    width: 1,
    height: 5,
    backgroundColor: '#333',
  },
  label: {
    color: '#666',
    fontSize: 9,
    marginTop: 1,
  },
});
