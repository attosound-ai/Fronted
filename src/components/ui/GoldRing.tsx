import type { ReactNode } from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GOLD } from '@/constants/gold';
import { COLORS } from '@/constants/theme';

interface GoldRingProps {
  /** Outer diameter of the ring + child content, in px. */
  size: number;
  /** Ring thickness in px. Defaults to 2. */
  thickness?: number;
  /** Corner radius. Defaults to full-round (size / 2). */
  radius?: number;
  children: ReactNode;
  style?: ViewStyle;
}

// Warm gold glow halo emitted around the ring (looks luminous on the dark UI).
// Wide, soft halo + a tighter brighter inner bloom so the gold reads as lit.
const GLOW = 'rgba(232, 201, 100, 0.75)';
const GLOW_INNER = 'rgba(255, 231, 153, 0.6)';

/**
 * Metallic gold ring wrapper with a soft gold glow. Renders a multi-stop
 * gradient border around any child (avatar, thumbnail, card) so the border reads
 * as polished gold, and an outer `boxShadow` glow so it shines.
 *
 * Stack: glow wrapper → dark backstop → gradient ring → highlight rim → child.
 */
export function GoldRing({
  size,
  thickness = 2,
  radius,
  children,
  style,
}: GoldRingProps) {
  const outerRadius = radius ?? size / 2;
  const innerRadius = Math.max(0, outerRadius - thickness);

  return (
    // Outer wrapper carries the glow (no overflow:hidden so it isn't clipped).
    <View
      style={[
        { width: size, height: size, borderRadius: outerRadius },
        styles.glow,
        style,
      ]}
    >
      <View
        style={[
          StyleSheet.absoluteFillObject,
          { borderRadius: outerRadius },
          styles.backstop,
        ]}
      >
        <LinearGradient
          colors={[
            GOLD.highlight,
            GOLD.bright,
            GOLD.base,
            GOLD.shadow,
            GOLD.base,
            GOLD.highlight,
            GOLD.shadowDeep,
          ]}
          locations={[0, 0.18, 0.38, 0.52, 0.68, 0.82, 1]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={[StyleSheet.absoluteFillObject, { borderRadius: outerRadius }]}
        />
        {/* Hairline inner highlight to fake a Fresnel rim. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0.5,
            left: 0.5,
            right: 0.5,
            bottom: 0.5,
            borderRadius: outerRadius,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: GOLD.highlight,
            opacity: 0.7,
          }}
        />
        <View
          style={{
            position: 'absolute',
            top: thickness,
            left: thickness,
            right: thickness,
            bottom: thickness,
            borderRadius: innerRadius,
            overflow: 'hidden',
            backgroundColor: COLORS.background.primary,
          }}
        >
          {children}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  glow: {
    boxShadow: `0px 0px 18px 2px ${GLOW}, 0px 0px 7px 0px ${GLOW_INNER}`,
  },
  backstop: {
    backgroundColor: GOLD.void,
    overflow: 'hidden',
  },
});
