import type { ReactNode } from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GOLD } from '@/constants/gold';

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

/**
 * Metallic gold ring wrapper. Renders a rotating multi-stop gradient border
 * around any child (avatar, thumbnail, card) so the border reads as actual
 * polished gold rather than flat #FFD700.
 *
 * Stack: dark backstop → gradient ring → hairline highlight rim → child.
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
    <View
      style={[
        { width: size, height: size, borderRadius: outerRadius },
        styles.backstop,
        style,
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
        style={[
          StyleSheet.absoluteFillObject,
          { borderRadius: outerRadius },
        ]}
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
          backgroundColor: '#000',
        }}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backstop: {
    backgroundColor: GOLD.void,
    overflow: 'hidden',
  },
});
