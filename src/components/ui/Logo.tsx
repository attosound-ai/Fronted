import { useEffect } from 'react';
import Svg, { ClipPath, Circle, G, Line } from 'react-native-svg';
import ReAnimated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  withSequence,
  withDelay,
  withRepeat,
  Easing,
} from 'react-native-reanimated';

const AnimatedG = ReAnimated.createAnimatedComponent(G);

const FADERS = [
  { x: -102.6, top: -80, bot: 20 },
  { x: -77.4, top: -28, bot: 5 },
  { x: -52.8, top: -52.9, bot: 20 },
  { x: -28.2, top: -53.8, bot: 53.8 },
  { x: 0, top: -34.5, bot: 83.1 },
  { x: 28.2, top: -56.3, bot: 44.5 },
  { x: 52.8, top: -56.3, bot: 20 },
  { x: 77.4, top: -28, bot: 5 },
  { x: 102.6, top: -80, bot: 20 },
];

const CIRCLE_R = 116;
const CAPSULE_W = 14;
const STEM_W = 3;

interface LogoProps {
  size?: number;
  animated?: boolean;
}

export function Logo({ size = 56, animated = false }: LogoProps) {
  const scaleY = useSharedValue(1);

  useEffect(() => {
    if (!animated) return;

    scaleY.value = withRepeat(
      withSequence(
        withTiming(1.07, { duration: 150, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 90, easing: Easing.inOut(Easing.ease) }),
        withTiming(1.042, { duration: 108, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 108, easing: Easing.inOut(Easing.ease) }),
        withDelay(744, withTiming(1, { duration: 0 })),
      ),
      -1,
    );
  }, [animated, scaleY]);

  const animatedProps = useAnimatedProps(() => ({
    transform: [{ scaleY: scaleY.value }],
  }));

  return (
    <Svg width={size} height={size} viewBox="-115 -115 230 230">
      <ClipPath id="logo-circle">
        <Circle cx={0} cy={0} r={CIRCLE_R} />
      </ClipPath>
      <G clipPath="url(#logo-circle)">
        {FADERS.map((f, i) => (
          <Line
            key={`s${i}`}
            x1={f.x}
            y1={-CIRCLE_R}
            x2={f.x}
            y2={CIRCLE_R}
            stroke="white"
            strokeWidth={STEM_W}
            opacity={1}
          />
        ))}
        {/* Extreme faders — static (no pulse) */}
        {[FADERS[0], FADERS[FADERS.length - 1]].map((f, i) => (
          <Line
            key={`cs${i}`}
            x1={f.x}
            y1={f.top}
            x2={f.x}
            y2={f.bot}
            stroke="white"
            strokeWidth={CAPSULE_W}
            strokeLinecap="round"
          />
        ))}
        {/* Inner faders — animated with pulse */}
        <AnimatedG animatedProps={animated ? animatedProps : undefined}>
          {FADERS.slice(1, -1).map((f, i) => (
            <Line
              key={`c${i}`}
              x1={f.x}
              y1={f.top}
              x2={f.x}
              y2={f.bot}
              stroke="white"
              strokeWidth={CAPSULE_W}
              strokeLinecap="round"
            />
          ))}
        </AnimatedG>
      </G>
    </Svg>
  );
}
