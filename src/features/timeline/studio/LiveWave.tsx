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
 * seconds and could not tell what, if anything, was going in.
 *
 * Cost matters here because it runs during a call. Everything is computed on
 * the UI thread in ONE worklet, at most 40 times a second, only while the
 * sheet is on screen, and the sixteen lines are drawn as six paths (the front
 * line plus five bands of three) so each update commits six nodes, not sixteen.
 */

const AnimatedPath = Animated.createAnimatedComponent(Path);

const BANDS = 5;
const LINES_PER_BAND = 3;
const LINES = 1 + BANDS * LINES_PER_BAND;
const POINTS = 36;
const HEIGHT = 120;
const MIN_STEP_S = 1 / 40;

interface Props {
  /** 0..1, what is going into the take right now. */
  level: SharedValue<number>;
  width: number;
  /** While false the ribbon rests as a flat line. */
  active: boolean;
  /** Draws only while true (the sheet is on screen). */
  running: boolean;
  /** Respect the editor's reduce animation preference: reacts, does not travel. */
  still?: boolean;
}

export function LiveWave({ level, width, active, running, still = false }: Props) {
  const phase = useSharedValue(0);
  // Eased level, so the ribbon breathes instead of flickering with each sample.
  const eased = useSharedValue(0);
  const on = useSharedValue(active ? 1 : 0);
  // Bumped at most MIN_STEP_S apart: the only thing the paths depend on.
  const step = useSharedValue(0);
  const sinceStep = useSharedValue(0);
  useEffect(() => {
    on.value = withTiming(active ? 1 : 0, { duration: 260 });
  }, [active, on]);

  const frame = useFrameCallback((info) => {
    const dt = Math.min(64, info.timeSincePreviousFrame ?? 16) / 1000;
    // Rise fast, fall slowly: speech reads as a living shape, not a strobe.
    const target = level.value * on.value;
    const k = target > eased.value ? 14 : 4.5;
    eased.value += (target - eased.value) * Math.min(1, k * dt);
    if (!still) phase.value += dt * (1.1 + eased.value * 2.4);
    sinceStep.value += dt;
    if (sinceStep.value >= MIN_STEP_S) {
      sinceStep.value = 0;
      step.value += 1;
    }
  }, false);
  useEffect(() => {
    frame.setActive(running);
    return () => frame.setActive(false);
  }, [running, frame]);

  // Index 0 is the front line; 1..BANDS are the bands, nearest first.
  const paths = useDerivedValue(() => {
    'worklet';
    // Read so the worklet reruns on every step.
    const tick = step.value;
    const out: string[] = [];
    if (tick < 0 || width <= 0) return out;
    const mid = HEIGHT / 2;
    const lvl = eased.value;
    // Silence must LOOK like silence: at level 0 the sixteen lines collapse
    // into one straight line. The first version kept the fan open at rest,
    // which read as "something is coming in" on an empty take.
    const amp = HEIGHT * 0.38 * (0.012 + lvl);
    const spread = Math.min(1, lvl * 2.4);
    const ph = phase.value;
    let band = '';
    for (let line = 0; line < LINES; line++) {
      // Depth: 0 is the front line, 1 the farthest.
      const depth = line / (LINES - 1);
      let d = '';
      for (let p = 0; p <= POINTS; p++) {
        const x = p / POINTS;
        // The fan: flat on the left, fully open from the middle on.
        const t = Math.min(1, Math.max(0, (x - 0.12) / 0.5));
        const open = t * t * (3 - 2 * t);
        // Each line trails the one in front and sits a little higher and
        // smaller, which is what reads as depth.
        const wave =
          Math.sin(x * 6.2 - ph - depth * 1.15) * (1 - depth * 0.3) +
          Math.sin(x * 10.4 - ph * 1.7 - depth * 0.6) * 0.22 * lvl;
        const y = mid + amp * open * wave - depth * open * HEIGHT * 0.15 * spread;
        // Tenths of a point, without toFixed (it dominates the cost).
        d +=
          (p === 0 ? 'M' : 'L') +
          Math.round(x * width * 10) / 10 +
          ' ' +
          Math.round(y * 10) / 10;
      }
      if (line === 0) {
        out.push(d);
      } else {
        band += d;
        if (line % LINES_PER_BAND === 0) {
          out.push(band);
          band = '';
        }
      }
    }
    return out;
  });

  return (
    <View style={[styles.box, { width }]} pointerEvents="none">
      <Svg width={width} height={HEIGHT}>
        {Array.from({ length: BANDS }, (_, i) => BANDS - i).map((band) => (
          <Band key={band} index={band} paths={paths} />
        ))}
        <Band index={0} paths={paths} />
      </Svg>
    </View>
  );
}

function Band({ index, paths }: { index: number; paths: SharedValue<string[]> }) {
  const animatedProps = useAnimatedProps(() => ({ d: paths.value[index] ?? '' }));
  const front = index === 0;
  return (
    <AnimatedPath
      animatedProps={animatedProps}
      stroke="#FFFFFF"
      strokeOpacity={front ? 1 : 0.6 - (index - 1) * 0.115}
      strokeWidth={front ? 2.4 : 1}
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
