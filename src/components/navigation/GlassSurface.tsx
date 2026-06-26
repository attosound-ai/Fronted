/**
 * GlassSurface — adaptive "Liquid Glass" background, 3-tier:
 *   1. iOS 26+  → real Liquid Glass via expo-glass-effect `GlassView`
 *   2. iOS <26  → translucent blur via expo-blur `BlurView`
 *   3. Android  → solid elevated surface (#1A1A1A) — the app's existing
 *                 floating-card convention (blur on Android is weak/expensive)
 *
 * The tier is decided ONCE at module init (both checks are synchronous). Render
 * it as a `StyleSheet.absoluteFill` background behind your content; it is
 * `pointerEvents="none"` so touches pass through to the content above.
 */

import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';

type Tier = 'glass' | 'blur' | 'solid';

export const GLASS_TIER: Tier = ((): Tier => {
  if (Platform.OS === 'ios' && isLiquidGlassAvailable()) return 'glass';
  if (Platform.OS === 'ios') return 'blur';
  return 'solid';
})();

/** Hairline border color tuned per tier (subtle over glass, visible over solid). */
export const GLASS_BORDER_COLOR =
  GLASS_TIER === 'solid' ? '#333333' : 'rgba(255,255,255,0.12)';

export function GlassSurface({
  children,
  style,
  radius = 0,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * Corner radius. Applied to BOTH the clipping container and the native
   * blur/glass element so rounded corners stay smooth and continuous —
   * clipping a blur via overflow alone leaves rough edges on iOS.
   */
  radius?: number;
}) {
  const round = radius ? { borderRadius: radius } : null;
  return (
    <View style={[style, radius ? { borderRadius: radius, overflow: 'hidden' } : null]}>
      {GLASS_TIER === 'glass' ? (
        <GlassView
          glassEffectStyle="regular"
          colorScheme="dark"
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, round]}
        />
      ) : GLASS_TIER === 'blur' ? (
        <BlurView
          intensity={60}
          tint="systemChromeMaterialDark"
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, round]}
        />
      ) : (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.solid, round]}
        />
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  solid: {
    backgroundColor: '#1A1A1A',
  },
});
