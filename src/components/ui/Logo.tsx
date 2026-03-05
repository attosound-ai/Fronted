import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { ClipPath, Circle, G, Line } from 'react-native-svg';

const AnimatedG = Animated.createAnimatedComponent(G);

const FADERS = [
  { x: -77.4, top: -31.9, bot: 8.4 },
  { x: -52.8, top: -52.9, bot: 37.8 },
  { x: -28.2, top: -53.8, bot: 53.8 },
  { x: 0, top: -44.5, bot: 73.1 },
  { x: 28.2, top: -56.3, bot: 44.5 },
  { x: 52.8, top: -56.3, bot: 37.8 },
  { x: 77.4, top: -30.2, bot: 13.4 },
];

const CIRCLE_R = 96;
const CAPSULE_W = 12.8;
const STEM_W = 1.2;

interface LogoProps {
  size?: number;
  animated?: boolean;
}

export function Logo({ size = 56, animated = false }: LogoProps) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!animated) return;

    const animation = Animated.loop(
      Animated.sequence([
        // 0% → 12.5% — scale up to 1.07
        Animated.timing(pulse, {
          toValue: 1.07,
          duration: 150,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        // 12.5% → 20% — back to 1
        Animated.timing(pulse, {
          toValue: 1,
          duration: 90,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        // 20% → 29% — scale up to 1.042
        Animated.timing(pulse, {
          toValue: 1.042,
          duration: 108,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        // 29% → 38% — back to 1
        Animated.timing(pulse, {
          toValue: 1,
          duration: 108,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        // 38% → 100% — hold at 1
        Animated.delay(744),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [animated, pulse]);

  if (animated) {
    return (
      <Animated.View style={{ transform: [{ scale: pulse }] }}>
        <LogoSvg size={size} />
      </Animated.View>
    );
  }

  return <LogoSvg size={size} />;
}

function LogoSvg({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="-100 -100 200 200">
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
            opacity={0.55}
          />
        ))}
        {FADERS.map((f, i) => (
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
      </G>
    </Svg>
  );
}
