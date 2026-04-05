import { useEffect, useRef, useMemo } from 'react';
import { View, Animated, StyleSheet } from 'react-native';

interface AudioWaveformProps {
  barCount?: number;
  barWidth?: number;
  barGap?: number;
  maxHeight?: number;
  minHeight?: number;
  color?: string;
  playedColor?: string;
  playing?: boolean;
  progress?: number;
  amplitudes?: number[]; // real-time PCM amplitudes (0–1), drives bars when playing
}

export function AudioWaveform({
  barCount = 35,
  barWidth = 3,
  barGap = 2,
  maxHeight = 40,
  minHeight = 4,
  color = '#FFFFFF',
  playedColor = '#FFFFFF',
  playing = true,
  progress = 0,
  amplitudes,
}: AudioWaveformProps) {
  const count = amplitudes && amplitudes.length > 0 ? amplitudes.length : barCount;

  // Random base heights for fallback animation
  const barHeights = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        base: minHeight + Math.random() * (maxHeight - minHeight) * 0.6,
        peak: minHeight + Math.random() * (maxHeight - minHeight),
      })),
    [count, maxHeight, minHeight]
  );

  const animValues = useRef(Array.from({ length: count }, () => new Animated.Value(0))).current;

  // Drive bars from real PCM amplitudes
  useEffect(() => {
    if (!amplitudes || amplitudes.length === 0) return;
    amplitudes.forEach((amp, i) => {
      if (!animValues[i]) return;
      Animated.spring(animValues[i], {
        toValue: amp,
        useNativeDriver: false,
        speed: 30,
        bounciness: 2,
      }).start();
    });
  }, [amplitudes, animValues]);

  // Fallback: random looping animation when no real amplitudes
  useEffect(() => {
    if (amplitudes && amplitudes.length > 0) return; // real data takes over

    if (!playing) {
      animValues.forEach((v) => v.setValue(0));
      return;
    }

    const animations = animValues.map((anim) =>
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

    const timeouts = animations.map((anim, i) => setTimeout(() => anim.start(), i * 30));
    return () => {
      timeouts.forEach(clearTimeout);
      animations.forEach((a) => a.stop());
    };
  }, [playing, amplitudes, animValues]);

  return (
    <View style={styles.container}>
      {barHeights.map((bar, i) => {
        const hasRealData = amplitudes && amplitudes.length > 0;
        const height = animValues[i].interpolate({
          inputRange: [0, 1],
          outputRange: hasRealData
            ? [minHeight, maxHeight]   // full range driven by real amplitude
            : [bar.base, bar.peak],    // random range for fallback
        });

        const barProgress = (i + 1) / count;
        const isPlayed = barProgress <= progress;

        return (
          <Animated.View
            key={i}
            style={[
              styles.bar,
              {
                width: barWidth,
                height,
                backgroundColor: isPlayed ? playedColor : color,
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
