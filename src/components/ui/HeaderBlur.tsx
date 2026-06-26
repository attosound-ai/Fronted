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
 * Why this shape (and why the old one banded):
 *   The previous version stacked several discrete `BlurView` bands with stepped
 *   opacity. Each band is a hard rectangle with a different blur opacity, so the
 *   eye sees a row of rectangles — exactly the "muchos rectángulos / cambios
 *   bruscos" artefact. Compositing N blurs of the same backdrop never adds up to
 *   a smooth fade; it adds visible seams.
 *
 * How the best apps actually do it — TWO smooth layers, never bands:
 *   1. A single SMOOTHSTEP gradient scrim (12 eased stops, zero slope at both
 *      ends → no hard top/bottom edge, and CAGradientLayer dithers it so there's
 *      no 8-bit banding). This is pure-JS, renders everywhere, and is the whole
 *      effect on Android. It's a clean homogeneous fade by itself.
 *   2. A TRUE progressive blur: ONE uniform `BlurView` whose OPACITY is faded by
 *      a gradient alpha mask (`@react-native-masked-view`). A single blur pass,
 *      dissolved edge-to-edge by the mask → no seams, no bands. This is the
 *      canonical iOS-quality technique (what Instagram/Apple do).
 *
 * The mask layer needs the native `@react-native-masked-view` module, so it only
 * lights up after a native rebuild. We DETECT that at runtime (see
 * `MASKED_VIEW_NATIVE_AVAILABLE`) so the frost self-activates on the first build
 * that bundles it — no manual flag, no redbox on the current binary. Until then
 * we render only the smoothstep scrim, which is already band-free and clean.
 *
 * Render it as an absolute-fill background behind the header content; it's
 * pointerEvents="none" so touches pass straight through.
 */

/**
 * Is the native `RNCMaskedView` actually in this binary? `hasViewManagerConfig`
 * is a safe registry query — it never mounts the component, so it can't throw an
 * "unimplemented component" error. Decided once at module load:
 *   • current binary (masked-view not yet built in) → false → scrim only
 *   • after a rebuild that includes masked-view        → true  → + progressive blur
 */
const MASKED_VIEW_NATIVE_AVAILABLE: boolean =
  GLASS_TIER !== 'solid' &&
  typeof UIManager.hasViewManagerConfig === 'function' &&
  UIManager.hasViewManagerConfig('RNCMaskedView');

// Number of gradient stops. More stops + an eased curve = a perceptually smooth
// fade with no visible kinks between stops.
const STOPS = 12;

// How far the fade spills BELOW the header bar, so the frost dissolves a little
// further into the content (a softer, longer tail) instead of ending right at
// the bar's edge. The parent headers render with overflow:visible so this shows.
const FADE_EXTEND = 26;

/** smoothstep: 0→1 with zero slope at both ends — no hard edge anywhere. */
function smoothstep01(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Build matching `colors` + `locations` arrays for a vertical fade where the
 * alpha follows `maxAlpha * (1 - smoothstep(t))`: strong and flat near the top,
 * a long gentle tail to fully transparent at the bottom — the homogeneous shape
 * Instagram uses. `rgb` is the scrim tint; the mask uses white.
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

// A scrim tint a touch lighter than pure black so the fade is visible over the
// app's black background (and darkens bright media for status-bar legibility).
// When the frost backs it, keep it light so the glass reads through; when it's
// the ONLY layer (no masked-view yet) make it denser so it stays visible.
const SCRIM = buildFade('20, 20, 24', MASKED_VIEW_NATIVE_AVAILABLE ? 0.55 : 0.92);
// The blur mask: white→transparent on the SAME smoothstep curve, so the frost
// dissolves with the exact same homogeneous profile as the scrim.
const MASK = buildFade('255, 255, 255', 1);

export function HeaderBlur({ style }: { style?: StyleProp<ViewStyle> }) {
  const showFrost = MASKED_VIEW_NATIVE_AVAILABLE;

  return (
    <View style={[styles.root, style]} pointerEvents="none">
      {/* Layer 1 (back): true progressive blur — one uniform BlurView faded by a
          smooth alpha mask. No bands, no seams. iOS only, post-rebuild. */}
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

      {/* Layer 2 (front): smoothstep scrim — the homogeneous fade. Darkens the
          top for legibility, dissolves to nothing at the bottom. This is the
          whole effect on Android and the pre-rebuild iOS look; with the frost
          behind it, it's the IG-style dark-top → frosted-middle → clear-bottom. */}
      <LinearGradient
        colors={SCRIM.colors}
        locations={SCRIM.locations}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Fills the header AND spills FADE_EXTEND px below it, so the fade tail reaches
  // a touch further into the content. Parent headers use overflow:visible.
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: -FADE_EXTEND,
  },
});
