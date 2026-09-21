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

  // The bar count changes at runtime: a card can ask for more bars than the
  // player reports amplitudes for, and the amplitudes themselves arrive with
  // their own length. The pool grows to whatever the current count needs, so
  // `animValues[i]` is never undefined (it used to crash the whole card with
  // "Cannot read property 'interpolate' of undefined").
  const animPool = useRef<Animated.Value[]>([]);
  if (animPool.current.length < count) {
    for (let i = animPool.current.length; i < count; i++) {
      animPool.current.push(new Animated.Value(0));
    }
  }
  const animValues = useMemo(
    () => animPool.current.slice(0, count),

    [count]
  );

  // Drive bars from real PCM amplitudes
  const lastAmplitudes = useRef<number[] | null>(null);
  useEffect(() => {
    if (!amplitudes || amplitudes.length === 0) {
      lastAmplitudes.current = null;
      return;
    }
    // Same values as last time (a parent re render, not new audio): leave
    // the running springs alone instead of restarting every one of them.
    const prev = lastAmplitudes.current;
    if (
      prev &&
      prev.length === amplitudes.length &&
      prev.every((v, i) => v === amplitudes[i])
    ) {
      return;
    }
    lastAmplitudes.current = amplitudes;
    amplitudes.forEach((amp, i) => {
      if (!animValues[i]) return;
      Animated.spring(animValues[i], {
        toValue: amp,
        useNativeDriver: true,
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
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 300 + Math.random() * 400,
            useNativeDriver: true,
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
        const value = animValues[i];
        if (!value) return null;
        // scaleY on the native driver, never `height`: a height animation is
        // a layout pass per bar per frame, driven from JS. Dozens of bars at
        // once was enough traffic to starve the screen (Sep 20 2026 freeze).
        // Every bar is laid out once at full height and only scaled.
        const scaleY = value.interpolate({
          inputRange: [0, 1],
          outputRange: hasRealData
            ? [minHeight / maxHeight, 1] // full range driven by real amplitude
            : [bar.base / maxHeight, bar.peak / maxHeight], // random range for fallback
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
                height: maxHeight,
                transform: [{ scaleY }],
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
