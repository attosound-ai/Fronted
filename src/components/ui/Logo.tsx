import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { ClipPath, Circle, G, Line } from 'react-native-svg';

const AnimatedG = Animated.createAnimatedComponent(G);

const FADERS = [
  { x: -102.6, top: -80, bot: 20 },
  { x: -77.4, top: -28, bot: 5 },
  { x: -52.8, top: -62.9, bot: 30 },
  { x: -28.2, top: -63.8, bot: 63.8 },
  { x: 0, top: -54.5, bot: 83.1 },
  { x: 28.2, top: -66.3, bot: 54.5 },
  { x: 52.8, top: -66.3, bot: 30 },
  { x: 77.4, top: -28, bot: 5 },
  { x: 102.6, top: -80, bot: 20 },
];

const CIRCLE_R = 116;
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
        Animated.timing(pulse, {
          toValue: 1.07,
          duration: 150,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 90,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1.042,
          duration: 108,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 108,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.delay(744),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [animated, pulse]);

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
            opacity={0.55}
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
        <AnimatedG style={{ transform: [{ scaleY: animated ? pulse : 1 }] }}>
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
