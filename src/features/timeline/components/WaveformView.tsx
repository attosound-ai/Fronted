import { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useWaveformData } from '../hooks/useWaveformData';

interface WaveformViewProps {
  segmentId: string;
  width: number;
  height: number;
  color?: string;
  samples?: number;
  /** Fraction (0-1) of the segment where this clip starts. */
  trimStart?: number;
  /** Fraction (0-1) of the segment where this clip ends. */
  trimEnd?: number;
}

/** Always fetch a fixed sample count so the query key stays stable during zoom. */
const FETCH_SAMPLES = 100;

/**
 * Resample an amplitude array to exactly `targetCount` entries.
 * Downsamples (bucket averaging) when shrinking, upsamples (linear interpolation) when expanding.
 */
function resample(source: number[], targetCount: number): number[] {
  if (targetCount <= 0 || source.length === 0) return [];
  if (source.length === targetCount) return source;

  if (targetCount === 1) {
    return [source.reduce((a, b) => a + b, 0) / source.length];
  }

  const result: number[] = new Array(targetCount);

  if (targetCount < source.length) {
    // Downsample: average buckets
    const bucketSize = source.length / targetCount;
    for (let i = 0; i < targetCount; i++) {
      const start = Math.floor(i * bucketSize);
      const end = Math.floor((i + 1) * bucketSize);
      let sum = 0;
      for (let j = start; j < end; j++) sum += source[j];
      result[i] = sum / (end - start);
    }
  } else {
    // Upsample: linear interpolation
    const ratio = (source.length - 1) / (targetCount - 1);
    for (let i = 0; i < targetCount; i++) {
      const srcPos = i * ratio;
      const lo = Math.floor(srcPos);
      const hi = Math.min(lo + 1, source.length - 1);
      const frac = srcPos - lo;
      result[i] = source[lo] * (1 - frac) + source[hi] * frac;
    }
  }

  return result;
}

export function WaveformView({
  segmentId,
  width,
  height,
  color = '#3B82F6',
  samples,
  trimStart = 0,
  trimEnd = 1,
}: WaveformViewProps) {
  const barWidth = 2;
  const barGap = 1;
  const numBars = Math.max(1, Math.floor(width / (barWidth + barGap)));

  // Fetch a fixed number of samples — query key never changes during zoom
  const { data: amplitudes } = useWaveformData(segmentId, samples ?? FETCH_SAMPLES);

  // Slice to clip's portion of the segment, then resample to fit the width
  const bars = useMemo(() => {
    if (!amplitudes) return [];
    const lo = Math.floor(trimStart * amplitudes.length);
    const hi = Math.max(lo + 1, Math.ceil(trimEnd * amplitudes.length));
    const slice = amplitudes.slice(lo, hi);
    return resample(slice, numBars);
  }, [amplitudes, numBars, trimStart, trimEnd]);

  if (bars.length === 0) {
    return <View style={[styles.container, { width, height }]} />;
  }

  const minBarHeight = 2;

  return (
    <View style={[styles.container, { width, height }]}>
      {bars.map((amp, i) => {
        const barHeight = Math.max(minBarHeight, amp * height);
        return (
          <View
            key={i}
            style={{
              width: barWidth,
              height: barHeight,
              backgroundColor: color,
              borderRadius: 1,
              marginRight: i < numBars - 1 ? barGap : 0,
            }}
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
    overflow: 'hidden',
  },
});
