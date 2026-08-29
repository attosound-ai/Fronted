import { memo, useMemo } from 'react';
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
 * Hard ceiling on rendered bar Views, no matter how wide the clip is. Every bar
 * is its own native view, and Fabric mounts/unmounts a clip's entire subtree in
 * ONE synchronous main-thread transaction. Uncapped, a 25-minute clip at the
 * default zoom is ~150,000 px wide, so floor(width/3) produced ~50,000 views;
 * deleting that clip blocked the main thread long enough that the client
 * force-killed the app (Sentry REACT-NATIVE-3W, Aug 3 2026). The data behind
 * those views is only FETCH_SAMPLES amplitudes, so past this cap the extra
 * views carry zero information; bars simply widen to keep filling the clip.
 */
const MAX_BARS = 512;

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

// memo: the editor tree still re-renders at a low rate during playback (the
// throttled reducer commit) and on every unrelated state change. Nothing about a
// waveform changes then, so skip re-running resample() + reconciling up to 512
// bar Views per clip unless its own props actually changed.
export const WaveformView = memo(function WaveformView({
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
  const idealBars = Math.max(1, Math.floor(width / (barWidth + barGap)));
  const numBars = Math.min(idealBars, MAX_BARS);
  // When capped, widen each bar so the waveform still fills the clip instead of
  // occupying only the leftmost MAX_BARS * 3 px of it.
  const effectiveBarWidth =
    numBars < idealBars
      ? Math.max(barWidth, (width - (numBars - 1) * barGap) / numBars)
      : barWidth;

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
              width: effectiveBarWidth,
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
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
});
