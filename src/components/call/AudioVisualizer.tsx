import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, G } from 'react-native-svg';

const POINT_COUNT = 96;
const UPDATE_INTERVAL = 50;

interface AudioVisualizerProps {
  isActive: boolean;
  width: number;
  height: number;
  /** Instantaneous amplitude (0..1). Modulates the whole waveform in real time. */
  liveAmplitude?: number;
}

/**
 * Layered flowing waveform visualizer inspired by high-end audio apps.
 * Three overlapping SVG paths with different gradients create depth and motion.
 * - If `amplitudes` is provided, uses real audio data
 * - Otherwise simulates an organic wave while `isActive`
 * - Flattens smoothly when inactive
 */
export function AudioVisualizer({ isActive, width, height, liveAmplitude }: AudioVisualizerProps) {
  const [points1, setPoints1] = useState<number[]>(() =>
    new Array(POINT_COUNT).fill(0.5),
  );
  const [points2, setPoints2] = useState<number[]>(() =>
    new Array(POINT_COUNT).fill(0.5),
  );
  const [points3, setPoints3] = useState<number[]>(() =>
    new Array(POINT_COUNT).fill(0.5),
  );
  const phaseRef = useRef(0);
  // Smoothed amplitude so sudden changes don't jitter (but still feels instant)
  const smoothedAmpRef = useRef(0);
  const liveAmpRef = useRef<number | undefined>(liveAmplitude);
  liveAmpRef.current = liveAmplitude;

  useEffect(() => {
    if (!isActive) {
      const id = setInterval(() => {
        smoothedAmpRef.current *= 0.85;
        setPoints1((prev) => prev.map((v) => v * 0.88 + 0.5 * 0.12));
        setPoints2((prev) => prev.map((v) => v * 0.88 + 0.5 * 0.12));
        setPoints3((prev) => prev.map((v) => v * 0.88 + 0.5 * 0.12));
      }, 50);
      return () => clearInterval(id);
    }

    const id = setInterval(() => {
      phaseRef.current += 0.4;
      const phase = phaseRef.current;
      const live = liveAmpRef.current;

      // Target amplitude: either real-time metering, or simulated
      let targetAmp: number;
      if (live != null) {
        // Light smoothing — fast attack, slower release (like real audio meters)
        const attackFactor = live > smoothedAmpRef.current ? 0.7 : 0.3;
        smoothedAmpRef.current =
          smoothedAmpRef.current * (1 - attackFactor) + live * attackFactor;
        targetAmp = smoothedAmpRef.current;
      } else {
        // Simulated: gentle constant amplitude
        targetAmp = 0.4;
      }

      // Build three target waveforms — amplitude scales the whole wave instantly
      const t1 = new Array(POINT_COUNT).fill(0);
      const t2 = new Array(POINT_COUNT).fill(0);
      const t3 = new Array(POINT_COUNT).fill(0);

      for (let i = 0; i < POINT_COUNT; i++) {
        const x = i / POINT_COUNT;
        const centerBias = Math.pow(1 - Math.abs(x - 0.5) * 2, 1.5);

        const w1 = Math.sin(x * Math.PI * 4 + phase) * 0.6;
        const w2 = Math.sin(x * Math.PI * 7 + phase * 1.2) * 0.4;
        const w3 = Math.sin(x * Math.PI * 11 + phase * 0.8) * 0.25;
        const noise = live != null ? 0 : (Math.random() - 0.5) * 0.08;

        t1[i] = 0.5 + (w1 + w2 * 0.5 + noise) * centerBias * targetAmp;
        t2[i] = 0.5 + (w2 + w3 * 0.6) * centerBias * targetAmp * 0.9;
        t3[i] = 0.5 + (w3 + w1 * 0.3) * centerBias * targetAmp * 0.8;
      }

      // Faster interpolation for more responsive feel
      setPoints1((prev) => prev.map((v, i) => v * 0.35 + t1[i] * 0.65));
      setPoints2((prev) => prev.map((v, i) => v * 0.35 + t2[i] * 0.65));
      setPoints3((prev) => prev.map((v, i) => v * 0.35 + t3[i] * 0.65));
    }, UPDATE_INTERVAL);

    return () => clearInterval(id);
  }, [isActive]);

  const path1 = buildSmoothPath(points1, width, height);
  const path2 = buildSmoothPath(points2, width, height);
  const path3 = buildSmoothPath(points3, width, height);

  return (
    <View style={[styles.container, { width, height }]}>
      <Svg width={width} height={height}>
        <Defs>
          {/* Primary: vibrant blue → orange → red gradient (matches reference image) */}
          <LinearGradient id="wave1" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#3B82F6" stopOpacity="0.9" />
            <Stop offset="0.3" stopColor="#8B5CF6" stopOpacity="0.95" />
            <Stop offset="0.55" stopColor="#EC4899" stopOpacity="1" />
            <Stop offset="0.8" stopColor="#F59E0B" stopOpacity="0.95" />
            <Stop offset="1" stopColor="#EF4444" stopOpacity="0.9" />
          </LinearGradient>
          {/* Secondary: softer, reversed */}
          <LinearGradient id="wave2" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#06B6D4" stopOpacity="0.7" />
            <Stop offset="0.5" stopColor="#A855F7" stopOpacity="0.8" />
            <Stop offset="1" stopColor="#F97316" stopOpacity="0.7" />
          </LinearGradient>
          {/* Tertiary: subtle accent */}
          <LinearGradient id="wave3" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#22D3EE" stopOpacity="0.5" />
            <Stop offset="0.5" stopColor="#E879F9" stopOpacity="0.6" />
            <Stop offset="1" stopColor="#FBBF24" stopOpacity="0.5" />
          </LinearGradient>
          {/* Glow layer */}
          <LinearGradient id="glow" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#3B82F6" stopOpacity="0.2" />
            <Stop offset="0.5" stopColor="#EC4899" stopOpacity="0.25" />
            <Stop offset="1" stopColor="#EF4444" stopOpacity="0.2" />
          </LinearGradient>
        </Defs>

        <G>
          {/* Soft glow background */}
          <Path d={path1} stroke="url(#glow)" strokeWidth={14} fill="none" strokeLinecap="round" />

          {/* Back layer — tertiary, wide & soft */}
          <Path d={path3} stroke="url(#wave3)" strokeWidth={5} fill="none" strokeLinecap="round" opacity={0.6} />

          {/* Mid layer — secondary */}
          <Path d={path2} stroke="url(#wave2)" strokeWidth={3.5} fill="none" strokeLinecap="round" opacity={0.85} />

          {/* Front layer — primary, crisp */}
          <Path d={path1} stroke="url(#wave1)" strokeWidth={2.5} fill="none" strokeLinecap="round" />
        </G>
      </Svg>
    </View>
  );
}

/** Smooth cubic-bezier path from normalized amplitude points. */
function buildSmoothPath(points: number[], width: number, height: number): string {
  if (points.length < 2) return '';
  const centerY = height / 2;
  const maxAmp = height * 0.42;

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = centerY + (p - 0.5) * 2 * maxAmp;
    return { x, y };
  });

  let d = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const curr = coords[i];
    const cp1x = prev.x + (curr.x - prev.x) / 2;
    const cp1y = prev.y;
    const cp2x = curr.x - (curr.x - prev.x) / 2;
    const cp2y = curr.y;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`;
  }
  return d;
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
