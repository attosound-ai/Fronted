import { useMemo } from 'react';
import {
  View,
  StyleSheet,
  UIManager,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import { GLASS_TIER } from '@/components/navigation/GlassSurface';

/**
 * HeaderBlur — a frosted header background that FADES toward the bottom, so a
 * floating header dissolves smoothly into the content with NO perceptible edge
 * or banding (Instagram-style).
 *
 * Two smooth layers, never bands:
 *   1. A single SMOOTHSTEP gradient scrim (12 eased stops, zero slope at both
 *      ends → no hard top/bottom edge, dithered → no 8-bit banding). Pure-JS,
 *      renders everywhere, and is the whole effect on Android.
 *   2. A TRUE progressive blur: ONE uniform `BlurView` faded by a gradient alpha
 *      mask (`@react-native-masked-view`) — the canonical iOS/Instagram
 *      technique. Self-activates once the native module is in the binary (see
 *      `MASKED_VIEW_NATIVE_AVAILABLE`), no redbox before then.
 *
 * Props let callers retint/resize it (e.g. the green in-call header reuses it
 * with `tintRgb` = green and `solid` so it blends with the solid call bar).
 */

/**
 * Is the native `RNCMaskedView` actually in this binary? `hasViewManagerConfig`
 * is a safe registry query — it never mounts the component, so it can't throw an
 * "unimplemented component" error.
 */
const MASKED_VIEW_NATIVE_AVAILABLE: boolean =
  GLASS_TIER !== 'solid' &&
  typeof UIManager.hasViewManagerConfig === 'function' &&
  UIManager.hasViewManagerConfig('RNCMaskedView');

// Number of gradient stops. More stops + an eased curve = a perceptually smooth
// fade with no visible kinks between stops.
const STOPS = 12;

/** Default spill BELOW the header bar so the fade tail reaches into the content. */
const FADE_EXTEND = 84;

/** Default scrim tint — a touch lighter than pure black so it reads over black. */
const DEFAULT_TINT = '20, 20, 24';

/** smoothstep: 0→1 with zero slope at both ends — no hard edge anywhere. */
function smoothstep01(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Build matching `colors` + `locations` arrays for a vertical fade where the
 * alpha follows `maxAlpha * (1 - smoothstep(t))`: strong and flat near the top,
 * a long gentle tail to fully transparent at the bottom. `rgb` is the tint.
 */
function buildFade(rgb: string, maxAlpha: number) {
  const colors: string[] = [];
  const locations: number[] = [];
  for (let i = 0; i < STOPS; i++) {
    const t = i / (STOPS - 1);
    const a = +(maxAlpha * (1 - smoothstep01(t))).toFixed(4);
    colors.push(`rgba(${rgb}, ${a})`);
    locations.push(+t.toFixed(4));
  }
  return {
    colors: colors as unknown as readonly [string, string, ...string[]],
    locations: locations as unknown as readonly [number, number, ...number[]],
  };
}

// The blur mask: white→transparent on the smoothstep curve (constant, reused).
const MASK = buildFade('255, 255, 255', 1);

interface HeaderBlurProps {
  style?: StyleProp<ViewStyle>;
  /** Scrim tint as "r, g, b". Default ~black; the in-call bar passes green. */
  tintRgb?: string;
  /**
   * Force a near-opaque scrim and skip the progressive blur. Use when the header
   * must blend with a SOLID bar above it (the green call bar) so there's no
   * opacity seam at the join.
   */
  solid?: boolean;
  /** How far the fade spills below the bar. */
  fadeExtend?: number;
}

export function HeaderBlur({
  style,
  tintRgb = DEFAULT_TINT,
  solid = false,
  fadeExtend = FADE_EXTEND,
}: HeaderBlurProps) {
  // Solid mode: opaque-ish scrim, no frost (blends with the solid bar above).
  const showFrost = MASKED_VIEW_NATIVE_AVAILABLE && !solid;
  const maxAlpha = solid ? 0.95 : MASKED_VIEW_NATIVE_AVAILABLE ? 0.55 : 0.92;
  const scrim = useMemo(() => buildFade(tintRgb, maxAlpha), [tintRgb, maxAlpha]);

  return (
    <View style={[styles.root, { bottom: -fadeExtend }, style]} pointerEvents="none">
      {/* Layer 1 (back): true progressive blur — one uniform BlurView faded by a
          smooth alpha mask. No bands, no seams. iOS only, when available. */}
      {showFrost && (
        <MaskedView
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          maskElement={
            <LinearGradient
              colors={MASK.colors}
              locations={MASK.locations}
              style={StyleSheet.absoluteFill}
            />
          }
        >
          <BlurView
            intensity={64}
            tint="systemChromeMaterialDark"
            style={StyleSheet.absoluteFill}
          />
        </MaskedView>
      )}

      {/* Layer 2 (front): smoothstep scrim — the homogeneous fade. */}
      <LinearGradient
        colors={scrim.colors}
        locations={scrim.locations}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Fills the header AND spills `fadeExtend` px below it (applied inline). Parent
  // headers use overflow:'visible' so the spill shows.
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
});
