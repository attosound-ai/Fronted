import { useEffect } from 'react';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  G,
  Line,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
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
  /**
   * Render the brushed-metal 3D variant matching the in-app icon ("studio"
   * artwork). Default `false` keeps the original flat white look — that
   * variant is the right call for small sizes (notification rows, profile
   * hero ~40 px) where the 3D detail would be muddy. Only the welcome hero
   * at size=290 currently opts into `metallic`.
   */
  metallic?: boolean;
}

export function Logo({ size = 56, animated = false, metallic = false }: LogoProps) {
  const scaleY = useSharedValue(1);

  useEffect(() => {
    if (!animated) return;

    // Two-beat heartbeat pulse: strong-soft-rest. Total cycle = 1200 ms.
    scaleY.value = withRepeat(
      withSequence(
        withTiming(1.07, { duration: 150, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 90, easing: Easing.inOut(Easing.ease) }),
        withTiming(1.042, { duration: 108, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 108, easing: Easing.inOut(Easing.ease) }),
        withDelay(744, withTiming(1, { duration: 0 }))
      ),
      -1
    );
  }, [animated, scaleY]);

  const animatedProps = useAnimatedProps(() => ({
    transform: [{ scaleY: scaleY.value }],
  }));

  // ── Flat variant (default) — preserved byte-for-byte for existing callsites
  if (!metallic) {
    return (
      <Svg width={size} height={size} viewBox="-115 -115 230 230">
        <ClipPath id="logo-circle-flat">
          <Circle cx={0} cy={0} r={CIRCLE_R} />
        </ClipPath>
        <G clipPath="url(#logo-circle-flat)">
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

  // ── Metallic 3D variant ────────────────────────────────────────────
  //
  // Composition (bottom-up):
  //   1. Background "dish"      — RadialGradient: lighter center, darker rim
  //   2. Rim light overlay      — LinearGradient: warm orange L → cool blue R
  //   3. Thin stems             — flat metal gradient (lateral cylinder)
  //   4. Extreme faders (static)— shadow Rect + body Rect (cap-metal grad) + top highlight
  //   5. Inner faders (animated)— same recipe, wrapped in AnimatedG that pulses scaleY
  //   6. Outer bezel ring       — thin dark stroke OUTSIDE the clip, for definition
  //
  // No <filter> primitives are used. react-native-svg's filter support is
  // partial on Android (`feSpecularLighting`, `feOffset`+`feMerge` chains
  // misbehave); composing shadows as duplicated offset rects is platform-safe.
  return (
    <Svg width={size} height={size} viewBox="-115 -115 230 230">
      <Defs>
        {/* Cylindrical-metal gradient: dark sides, bright peak in the middle.
            Applied to wide capsules — gives each one a 3D cylinder feel. */}
        <LinearGradient id="cap-metal" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0%" stopColor="#1f1f1f" />
          <Stop offset="10%" stopColor="#5a5a5a" />
          <Stop offset="35%" stopColor="#e8e8e8" />
          <Stop offset="50%" stopColor="#ffffff" />
          <Stop offset="65%" stopColor="#e8e8e8" />
          <Stop offset="90%" stopColor="#5a5a5a" />
          <Stop offset="100%" stopColor="#1f1f1f" />
        </LinearGradient>
        {/* Same idea but fewer stops, sized for the 3 px stems. */}
        <LinearGradient id="stem-metal" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0%" stopColor="#3a3a3a" />
          <Stop offset="50%" stopColor="#e0e0e0" />
          <Stop offset="100%" stopColor="#3a3a3a" />
        </LinearGradient>
        {/* Specular hot-spot at the top cap of each capsule. */}
        <RadialGradient id="cap-highlight" cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0%" stopColor="#ffffff" stopOpacity={1} />
          <Stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
        </RadialGradient>
        {/* Subtly-domed background — slightly lighter in the middle. */}
        <RadialGradient id="bg-dish" cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0%" stopColor="#1a1a1a" />
          <Stop offset="75%" stopColor="#0c0c0c" />
          <Stop offset="100%" stopColor="#050505" />
        </RadialGradient>
        {/* Rim light — orange hint on the left edge, blue on the right.
            Mirrors the warm/cool cinematic side-lighting on the app icon. */}
        <LinearGradient id="rim-light" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0%" stopColor="#FF8A3D" stopOpacity={0.18} />
          <Stop offset="20%" stopColor="#000000" stopOpacity={0} />
          <Stop offset="80%" stopColor="#000000" stopOpacity={0} />
          <Stop offset="100%" stopColor="#5A8BFF" stopOpacity={0.18} />
        </LinearGradient>
        <ClipPath id="logo-circle">
          <Circle cx={0} cy={0} r={CIRCLE_R} />
        </ClipPath>
      </Defs>

      <G clipPath="url(#logo-circle)">
        {/* Background plate */}
        <Circle cx={0} cy={0} r={CIRCLE_R} fill="url(#bg-dish)" />
        <Circle cx={0} cy={0} r={CIRCLE_R} fill="url(#rim-light)" />

        {/* 9 thin stems running full height — shadow + body */}
        {FADERS.map((f, i) => (
          <G key={`stem-${i}`}>
            <Rect
              x={f.x - STEM_W / 2 + 0.5}
              y={-CIRCLE_R}
              width={STEM_W}
              height={2 * CIRCLE_R}
              fill="#000"
              opacity={0.45}
            />
            <Rect
              x={f.x - STEM_W / 2}
              y={-CIRCLE_R}
              width={STEM_W}
              height={2 * CIRCLE_R}
              fill="url(#stem-metal)"
            />
          </G>
        ))}

        {/* Extreme faders — static anchors */}
        {[FADERS[0], FADERS[FADERS.length - 1]].map((f, i) => (
          <G key={`ext-${i}`}>
            <Rect
              x={f.x - CAPSULE_W / 2 + 1}
              y={f.top + 1.5}
              width={CAPSULE_W}
              height={f.bot - f.top}
              rx={CAPSULE_W / 2}
              ry={CAPSULE_W / 2}
              fill="#000"
              opacity={0.55}
            />
            <Rect
              x={f.x - CAPSULE_W / 2}
              y={f.top}
              width={CAPSULE_W}
              height={f.bot - f.top}
              rx={CAPSULE_W / 2}
              ry={CAPSULE_W / 2}
              fill="url(#cap-metal)"
            />
            <Circle
              cx={f.x}
              cy={f.top + CAPSULE_W / 2}
              r={CAPSULE_W / 2 - 1.5}
              fill="url(#cap-highlight)"
              opacity={0.85}
            />
          </G>
        ))}

        {/* Inner faders — heartbeat pulse */}
        <AnimatedG animatedProps={animated ? animatedProps : undefined}>
          {FADERS.slice(1, -1).map((f, i) => (
            <G key={`inn-${i}`}>
              <Rect
                x={f.x - CAPSULE_W / 2 + 1}
                y={f.top + 1.5}
                width={CAPSULE_W}
                height={f.bot - f.top}
                rx={CAPSULE_W / 2}
                ry={CAPSULE_W / 2}
                fill="#000"
                opacity={0.55}
              />
              <Rect
                x={f.x - CAPSULE_W / 2}
                y={f.top}
                width={CAPSULE_W}
                height={f.bot - f.top}
                rx={CAPSULE_W / 2}
                ry={CAPSULE_W / 2}
                fill="url(#cap-metal)"
              />
              <Circle
                cx={f.x}
                cy={f.top + CAPSULE_W / 2}
                r={CAPSULE_W / 2 - 1.5}
                fill="url(#cap-highlight)"
                opacity={0.85}
              />
            </G>
          ))}
        </AnimatedG>
      </G>

      {/* Outer bezel — drawn OUTSIDE the clip, so the line sits on top of
          the silhouette edge and gives the badge a defined boundary. */}
      <Circle
        cx={0}
        cy={0}
        r={CIRCLE_R - 0.5}
        fill="none"
        stroke="#000"
        strokeOpacity={0.6}
        strokeWidth={1}
      />
    </Svg>
  );
}
