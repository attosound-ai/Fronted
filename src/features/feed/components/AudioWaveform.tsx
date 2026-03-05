import { useEffect, useRef, useMemo } from 'react';
import { View, Animated, StyleSheet } from 'react-native';

interface AudioWaveformProps {
  barCount?: number;
  barWidth?: number;
  barGap?: number;
  maxHeight?: number;
  minHeight?: number;
  color?: string;
  playing?: boolean;
}

/**
 * AudioWaveform — Animated vertical bars simulating a sound waveform.
 *
 * Single Responsibility: Only renders and animates waveform bars.
 * Each bar has a random base amplitude and oscillates independently.
 */
export function AudioWaveform({
  barCount = 35,
  barWidth = 3,
  barGap = 2,
  maxHeight = 40,
  minHeight = 4,
  color = '#3B82F6',
  playing = true,
}: AudioWaveformProps) {
  // Generate random base heights once (stable across re-renders)
  const barHeights = useMemo(
    () =>
      Array.from({ length: barCount }, () => ({
        base: minHeight + Math.random() * (maxHeight - minHeight) * 0.6,
        peak: minHeight + Math.random() * (maxHeight - minHeight),
      })),
    [barCount, maxHeight, minHeight]
  );

  const animValues = useRef(barHeights.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (!playing) {
      animValues.forEach((v) => v.setValue(0));
      return;
    }

    const animations = animValues.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 1,
            duration: 300 + Math.random() * 400,
            useNativeDriver: false,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 300 + Math.random() * 400,
            useNativeDriver: false,
          }),
        ])
      )
    );

    // Stagger start for natural effect
    const timeouts = animations.map((anim, i) => {
      return setTimeout(() => anim.start(), i * 30);
    });

    return () => {
      timeouts.forEach(clearTimeout);
      animations.forEach((a) => a.stop());
    };
  }, [playing, animValues]);

  return (
    <View style={styles.container}>
      {barHeights.map((bar, i) => {
        const height = animValues[i].interpolate({
          inputRange: [0, 1],
          outputRange: [bar.base, bar.peak],
        });

        return (
          <Animated.View
            key={i}
            style={[
              styles.bar,
              {
                width: barWidth,
                height,
                backgroundColor: color,
                marginHorizontal: barGap / 2,
                borderRadius: barWidth / 2,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: {},
});
