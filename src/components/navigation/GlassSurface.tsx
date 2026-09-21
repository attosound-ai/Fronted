/**
 * GlassSurface: adaptive "Liquid Glass" background, three tiers:
 *   1. iOS 26 and newer: real Liquid Glass via expo-glass-effect `GlassView`
 *   2. Older iOS: translucent blur via expo-blur `BlurView`
 *   3. Android: solid elevated surface (#1A1A1A), the app's existing
 *      floating card convention (blur on Android is weak and expensive)
 *
 * The tier is decided ONCE at module init (both checks are synchronous). Render
 * it as a `StyleSheet.absoluteFill` background behind your content; it is
 * `pointerEvents="none"` so touches pass through to the content above.
 *
 * The optional props exist for surfaces that need a different glass recipe than
 * the app chrome, such as the call keypad keys, which follow Apple's dial pad.
 * Leave them out and the surface looks exactly as it always did.
 */

import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable, type GlassStyle } from 'expo-glass-effect';

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
  glassStyle = 'regular',
  tintColor,
  blurIntensity = 60,
  solidColor,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * Corner radius. Applied to BOTH the clipping container and the native
   * blur or glass element so rounded corners stay smooth and continuous.
   * Clipping a blur with overflow alone leaves rough edges on iOS.
   */
  radius?: number;
  /** 'clear' is thinner and lets more of the backdrop through than 'regular'. */
  glassStyle?: GlassStyle;
  /** Tints the glass, and tints the blur and solid tiers with the same color. */
  tintColor?: string;
  /** Blur strength on the pre iOS 26 tier. */
  blurIntensity?: number;
  /** Fill for the Android tier when the default elevated surface is wrong. */
  solidColor?: string;
}) {
  const round = radius ? { borderRadius: radius } : null;
  return (
    <View style={[style, radius ? { borderRadius: radius, overflow: 'hidden' } : null]}>
      {GLASS_TIER === 'glass' ? (
        <GlassView
          glassEffectStyle={glassStyle}
          tintColor={tintColor}
          colorScheme="dark"
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, round]}
        />
      ) : GLASS_TIER === 'blur' ? (
        <BlurView
          intensity={blurIntensity}
          tint="systemChromeMaterialDark"
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            round,
            tintColor ? { backgroundColor: tintColor } : null,
          ]}
        />
      ) : (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.solid,
            round,
            solidColor ? { backgroundColor: solidColor } : null,
          ]}
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
