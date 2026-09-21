import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Text } from '@/components/ui/Text';
import { GlassSurface } from '@/components/navigation/GlassSurface';
import { haptic } from '@/lib/haptics/hapticService';
import { STUDIO, STUDIO_COLORS } from './studioTheme';

/**
 * The two button shapes of the studio editor, in ATTO's language: a labeled
 * pill (white when active, outlined otherwise, dimmed when it cannot act)
 * and a glass circle for icons. Every SoundLab control maps to one of them.
 */

interface PillProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
  destructive?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function StudioPill({
  label,
  onPress,
  disabled = false,
  active = false,
  destructive = false,
  style,
  accessibilityLabel,
}: PillProps) {
  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        void haptic('light');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled, selected: active }}
      style={({ pressed }) => [
        styles.pill,
        active && styles.pillActive,
        destructive && !active && styles.pillDestructive,
        disabled && styles.pillDisabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <Text
        variant="small"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        maxFontSizeMultiplier={1.05}
        style={[
          styles.pillLabel,
          active && styles.pillLabelActive,
          destructive && !active && styles.pillLabelDestructive,
          disabled && styles.pillLabelDisabled,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

interface IconProps {
  icon: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
  size?: number;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  /** Filled white circle (the primary action of a bar, like Share). */
  primary?: boolean;
}

export function StudioIconButton({
  icon,
  onPress,
  disabled = false,
  active = false,
  size = STUDIO.iconButton,
  accessibilityLabel,
  style,
  primary = false,
}: IconProps) {
  const circle = { width: size, height: size, borderRadius: size / 2 };
  const inner = (
    <Pressable
      onPress={() => {
        if (disabled) return;
        void haptic('light');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, selected: active }}
      hitSlop={6}
      style={({ pressed }) => [
        styles.iconInner,
        circle,
        primary && styles.iconPrimary,
        active && !primary && styles.iconActive,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <View style={disabled ? styles.iconDisabled : undefined}>{icon}</View>
    </Pressable>
  );
  if (primary) {
    return <View style={[circle, style]}>{inner}</View>;
  }
  return (
    <GlassSurface radius={size / 2} style={[circle, style]}>
      {inner}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: 32,
    minWidth: 46,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: STUDIO_COLORS.borderStrong,
    backgroundColor: STUDIO_COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: {
    backgroundColor: STUDIO_COLORS.primary,
    borderColor: STUDIO_COLORS.primary,
  },
  pillDestructive: {
    borderColor: 'rgba(255,59,48,0.5)',
  },
  pillDisabled: {
    opacity: 0.35,
  },
  pillLabel: {
    color: STUDIO_COLORS.text,
    fontFamily: 'Archivo_500Medium',
    fontSize: 13,
  },
  pillLabelActive: {
    color: STUDIO_COLORS.onPrimary,
  },
  pillLabelDestructive: {
    color: '#FF6B61',
  },
  pillLabelDisabled: {
    color: STUDIO_COLORS.text,
  },
  iconInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPrimary: {
    backgroundColor: STUDIO_COLORS.primary,
  },
  iconActive: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  iconDisabled: {
    opacity: 0.35,
  },
  pressed: {
    opacity: 0.7,
  },
});
