import { memo, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useWaveformData, WAVEFORM_PEAKS } from '../hooks/useWaveformData';

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

/** Always fetch a fixed peak count so the query key stays stable during zoom. */
const FETCH_SAMPLES = WAVEFORM_PEAKS;

/**
 * Horizontal resolution of the drawn envelope: one point per PX_PER_POINT
 * pixels, capped at MAX_POINTS. The whole waveform is ONE native node (an SVG
 * path), so this cap is about path-string size, not view count. It used to be
 * up to 512 individual bar <View>s per clip, mounted/unmounted in one Fabric
 * transaction: a 25-minute clip produced ~50,000 views and deleting it hung
 * the main thread (Sentry REACT-NATIVE-3W). Now the same clip is 2 nodes.
 */
const PX_PER_POINT = 2;
const MAX_POINTS = 1024;

/**
 * Resample a peak array to exactly `targetCount` entries.
 * Downsamples by bucket MAX (keeps transients), upsamples by linear interpolation.
 */
function resample(source: number[], targetCount: number): number[] {
  if (targetCount <= 0 || source.length === 0) return [];
  if (source.length === targetCount) return source;

  if (targetCount === 1) {
    let peak = 0;
    for (const v of source) if (v > peak) peak = v;
    return [peak];
  }

  const result: number[] = new Array(targetCount);

  if (targetCount < source.length) {
    // Downsample: take the PEAK of each bucket. The source is already a peak
    // envelope (backend), and averaging peaks flattens transients back into the
    // blur we just removed; max-per-bucket is how every waveform renderer
    // (peaks.js / wavesurfer) produces a zoomed-out view.
    const bucketSize = source.length / targetCount;
    for (let i = 0; i < targetCount; i++) {
      const start = Math.floor(i * bucketSize);
      const end = Math.max(start + 1, Math.floor((i + 1) * bucketSize));
      let peak = 0;
      for (let j = start; j < end && j < source.length; j++) {
        if (source[j] > peak) peak = source[j];
      }
      result[i] = peak;
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

/**
 * Build a filled, vertically mirrored envelope path (the pro-DAW look): the
 * top edge follows the peaks left→right, the bottom edge mirrors them
 * right→left, closed into one shape. A floor of MIN_HALF px keeps silence
 * visible as a thin centre line instead of vanishing.
 */
function buildEnvelopePath(peaks: number[], width: number, height: number): string {
  const n = peaks.length;
  if (n === 0) return '';
  const mid = height / 2;
  const half = Math.max(1, mid - 1);
  const MIN_HALF = 1;
  const step = n > 1 ? width / (n - 1) : 0;
  const r1 = (v: number) => Math.round(v * 10) / 10;

  let d = '';
  for (let i = 0; i < n; i++) {
    const x = r1(i * step);
    const y = r1(mid - Math.max(MIN_HALF, peaks[i] * half));
    d += i === 0 ? `M${x},${y}` : `L${x},${y}`;
  }
  for (let i = n - 1; i >= 0; i--) {
    const x = r1(i * step);
    const y = r1(mid + Math.max(MIN_HALF, peaks[i] * half));
    d += `L${x},${y}`;
  }
  return `${d}Z`;
}

// memo: the editor tree still re-renders at a low rate during playback (the
// throttled reducer commit) and on every unrelated state change. Nothing about a
// waveform changes then, so skip rebuilding the path unless its own props change.
export const WaveformView = memo(function WaveformView({
  segmentId,
  width,
  height,
  color = '#3B82F6',
  samples,
  trimStart = 0,
  trimEnd = 1,
}: WaveformViewProps) {
  const numPoints = Math.max(2, Math.min(MAX_POINTS, Math.floor(width / PX_PER_POINT)));

  // Fetch a fixed number of peaks — query key never changes during zoom
  const { data: amplitudes } = useWaveformData(segmentId, samples ?? FETCH_SAMPLES);

  // Slice to the clip's portion of the segment, resample to the on-screen
  // resolution, then serialize to ONE path string. Only re-runs when the clip's
  // own geometry or its peaks change (zoom commit, trim, data arrival).
  const pathD = useMemo(() => {
    if (!amplitudes || amplitudes.length === 0) return '';
    const lo = Math.floor(trimStart * amplitudes.length);
    const hi = Math.max(lo + 1, Math.ceil(trimEnd * amplitudes.length));
    const slice = amplitudes.slice(lo, hi);
    return buildEnvelopePath(resample(slice, numPoints), width, height);
  }, [amplitudes, numPoints, trimStart, trimEnd, width, height]);

  if (pathD === '') {
    return <View style={[styles.container, { width, height }]} />;
  }

  return (
    <View style={[styles.container, { width, height }]} pointerEvents="none">
      <Svg width={width} height={height}>
        <Path d={pathD} fill={color} fillOpacity={0.92} />
      </Svg>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
