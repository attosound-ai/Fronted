import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

/**
 * The live monitor of a take: one bright line that fans out into a ribbon of
 * parallel curves, drawn in perspective (each line a little behind and a
 * little fainter than the one before). The ribbon's height IS the level of
 * what is being recorded, so a flat line means nothing is going into the
 * take. That is the point of it: on Sep 30 2026 the client recorded fifteen
 * seconds of near silence and only found out afterwards.
 *
 * All the drawing runs on the UI thread (Reanimated worklets), so it keeps
 * moving at display rate without touching the JS thread during a call.
 */

const AnimatedPath = Animated.createAnimatedComponent(Path);

const LINES = 16;
const POINTS = 44;
const HEIGHT = 120;

interface Props {
  /** 0..1, what is going into the take right now. */
  level: SharedValue<number>;
  width: number;
  /** While false the ribbon rests as a flat line. */
  active: boolean;
  /** Respect the editor's reduce animation preference. */
  still?: boolean;
}

export function LiveWave({ level, width, active, still = false }: Props) {
  const phase = useSharedValue(0);
  // Eased level, so the ribbon breathes instead of flickering with each sample.
  const eased = useSharedValue(0);
  const on = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    on.value = withTiming(active ? 1 : 0, { duration: 260 });
  }, [active, on]);

  useFrameCallback((frame) => {
    const dt = Math.min(64, frame.timeSincePreviousFrame ?? 16) / 1000;
    // Rise fast, fall slowly: speech reads as a living shape, not a strobe.
    const target = level.value * on.value;
    const k = target > eased.value ? 14 : 4.5;
    eased.value += (target - eased.value) * Math.min(1, k * dt);
    if (!still) phase.value += dt * (1.1 + eased.value * 2.4);
  });

  return (
    <View style={[styles.box, { width }]} pointerEvents="none">
      <Svg width={width} height={HEIGHT}>
        {Array.from({ length: LINES }, (_, i) => (
          <Line key={i} index={i} width={width} phase={phase} level={eased} />
        ))}
      </Svg>
    </View>
  );
}

function Line({
  index,
  width,
  phase,
  level,
}: {
  index: number;
  width: number;
  phase: SharedValue<number>;
  level: SharedValue<number>;
}) {
  // Depth: 0 is the front line, 1 the farthest.
  const depth = index / (LINES - 1);
  const d = useDerivedValue(() => {
    'worklet';
    const mid = HEIGHT / 2;
    // A floor keeps a hint of the ribbon alive at silence without faking sound.
    const amp = HEIGHT * 0.36 * (0.035 + level.value);
    let path = '';
    for (let p = 0; p <= POINTS; p++) {
      const x = p / POINTS;
      // The fan: flat on the left, fully open from the middle on.
      const t = Math.min(1, Math.max(0, (x - 0.12) / 0.5));
      const open = t * t * (3 - 2 * t);
      // Each line trails the one in front and sits a little higher and smaller,
      // which is what reads as depth.
      const wave =
        Math.sin(x * 5.2 - phase.value - depth * 1.15) * (1 - depth * 0.3) +
        Math.sin(x * 9.1 - phase.value * 1.7 - depth * 0.6) * 0.22 * level.value;
      const y = mid + amp * open * wave - depth * open * HEIGHT * 0.16;
      path += (p === 0 ? 'M' : 'L') + (x * width).toFixed(1) + ' ' + y.toFixed(1);
    }
    return path;
  });
  const animatedProps = useAnimatedProps(() => ({ d: d.value }));
  return (
    <AnimatedPath
      animatedProps={animatedProps}
      stroke="#FFFFFF"
      strokeOpacity={index === 0 ? 1 : 0.62 * (1 - depth) + 0.06}
      strokeWidth={index === 0 ? 2.4 : 1}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  );
}

const styles = StyleSheet.create({
  box: {
    height: HEIGHT,
    alignSelf: 'center',
    marginTop: 6,
  },
});
