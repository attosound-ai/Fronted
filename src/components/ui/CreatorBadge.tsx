import { View, StyleSheet, PixelRatio, type ViewStyle } from 'react-native';
import Svg, {
  Path,
  Defs,
  LinearGradient,
  RadialGradient,
  ClipPath,
  Stop,
  G,
} from 'react-native-svg';
import { GOLD, GOLD_FILL_STOPS, GOLD_BEVEL_STOPS } from '@/constants/gold';

type BadgeSize = 'sm' | 'md' | 'lg';

const SIZES: Record<BadgeSize, number> = {
  sm: 18,
  md: 22,
  lg: 28,
};

interface CreatorBadgeProps {
  size?: BadgeSize;
  style?: ViewStyle;
}

// Coordinate space is deliberately large so every subpixel edge lands on a
// clean floating-point boundary. Combined with vectorEffect=non-scaling-stroke
// this keeps strokes the same physical pixel width regardless of render size.
const VB = 96;
const CX = VB / 2;
const CY = VB / 2;
const OUTER_R = 43.2; // 0.9 * (VB/2)
const INNER_R = OUTER_R * 0.42;

function buildStarPath(outer: number, inner: number, points: number) {
  const coords: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const angle = (Math.PI * i) / points - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    const x = CX + r * Math.cos(angle);
    const y = CY + r * Math.sin(angle);
    coords.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(4)},${y.toFixed(4)}`);
  }
  return coords.join('') + 'Z';
}

const STAR_PATH = buildStarPath(OUTER_R, INNER_R, 5);
const STAR_INNER_PATH = buildStarPath(OUTER_R * 0.55, INNER_R * 0.55, 5);

export function CreatorBadge({ size = 'md', style }: CreatorBadgeProps) {
  // Render the SVG at the nearest whole device-pixel so vertical/horizontal
  // anti-aliasing doesn't smear across rows on low-DPR screens.
  const logical = SIZES[size];
  const physical = PixelRatio.roundToNearestPixel(logical);

  return (
    <View
      style={[styles.container, { width: physical, height: physical }, style]}
    >
      <Svg
        width={physical}
        height={physical}
        viewBox={`0 0 ${VB} ${VB}`}
        // geometricPrecision hint improves subpixel anti-aliasing on iOS.
      >
        <Defs>
          {/* Core metallic body — 8-stop anisotropic reflection. */}
          <LinearGradient id="goldBody" x1="15%" y1="0%" x2="85%" y2="100%">
            {GOLD_FILL_STOPS.map((s) => (
              <Stop key={s.offset} offset={s.offset} stopColor={s.color} />
            ))}
          </LinearGradient>

          {/* Beveled edge — light/dark chasing along 45°. */}
          <LinearGradient id="goldBevel" x1="0%" y1="0%" x2="100%" y2="100%">
            {GOLD_BEVEL_STOPS.map((s) => (
              <Stop key={s.offset} offset={s.offset} stopColor={s.color} />
            ))}
          </LinearGradient>

          {/* Edge vignette — darkens the outer rim for depth. */}
          <RadialGradient id="goldEdge" cx="50%" cy="50%" rx="60%" ry="60%">
            <Stop offset="0%" stopColor={GOLD.bright} stopOpacity={0} />
            <Stop offset="72%" stopColor={GOLD.shadow} stopOpacity={0} />
            <Stop offset="100%" stopColor={GOLD.void} stopOpacity={0.55} />
          </RadialGradient>

          {/* Specular — tight, offset to upper-left. */}
          <RadialGradient id="specular" cx="32%" cy="26%" rx="42%" ry="34%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.95} />
            <Stop offset="35%" stopColor="#FFFDF0" stopOpacity={0.55} />
            <Stop offset="70%" stopColor="#FFFDF0" stopOpacity={0.12} />
            <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>

          {/* Bounce light on the lower-right rim. */}
          <RadialGradient id="bounce" cx="72%" cy="78%" rx="30%" ry="24%">
            <Stop offset="0%" stopColor={GOLD.highlight} stopOpacity={0.5} />
            <Stop offset="100%" stopColor={GOLD.highlight} stopOpacity={0} />
          </RadialGradient>

          {/* Ambient occlusion in the valleys. */}
          <RadialGradient id="valleyAO" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0%" stopColor={GOLD.void} stopOpacity={0.5} />
            <Stop offset="60%" stopColor={GOLD.shadowDeep} stopOpacity={0.18} />
            <Stop offset="100%" stopColor={GOLD.void} stopOpacity={0} />
          </RadialGradient>

          <ClipPath id="starClip">
            <Path d={STAR_PATH} />
          </ClipPath>
        </Defs>

        {/* Metallic body fill. */}
        <Path d={STAR_PATH} fill="url(#goldBody)" />

        {/* Everything inside the star outline. */}
        <G clipPath="url(#starClip)">
          <Path d={STAR_PATH} fill="url(#goldEdge)" />
          <Path d={STAR_INNER_PATH} fill="url(#valleyAO)" />

          {/* Thin horizontal reflection streak — anisotropic polish band. */}
          <Path
            d={`M0,${CY - 6} L${VB},${CY - 8} L${VB},${CY - 2} L0,${CY} Z`}
            fill={GOLD.highlight}
            opacity={0.22}
          />

          <Path d={STAR_PATH} fill="url(#bounce)" />
          <Path d={STAR_PATH} fill="url(#specular)" />
        </G>

        {/* Single clean outer rim — stamped-in-metal look. */}
        <Path
          d={STAR_PATH}
          fill="none"
          stroke={GOLD.void}
          strokeWidth={1.25}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* Bevel highlight — only one stroke on top to avoid muddy edges. */}
        <Path
          d={STAR_PATH}
          fill="none"
          stroke="url(#goldBevel)"
          strokeWidth={0.75}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          opacity={0.95}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
