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
import { showToast } from '@/components/ui/Toast';
import { STUDIO, STUDIO_COLORS } from './studioTheme';

/**
 * The two button shapes of the studio editor, in ATTO's language: a labeled
 * pill (white when active, outlined otherwise, dimmed when it cannot act)
 * and a glass circle for icons. Every SoundLab control maps to one of them.
 *
 * A dimmed button in SoundLab ignores the tap and never says why. Here a
 * dimmed button that knows its reason says it: a toast with what is missing
 * ("Select a range first") and a warning tap, so nothing fails in silence.
 */

function press(
  disabled: boolean,
  disabledReason: string | undefined,
  onPress: () => void
) {
  if (disabled) {
    if (disabledReason) {
      void haptic('warning');
      showToast(disabledReason, 'warning');
    }
    return;
  }
  void haptic('light');
  onPress();
}

interface PillProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Shown when the dimmed pill is tapped: what the user has to do first. */
  disabledReason?: string;
  active?: boolean;
  destructive?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function StudioPill({
  label,
  onPress,
  disabled = false,
  disabledReason,
  active = false,
  destructive = false,
  style,
  accessibilityLabel,
}: PillProps) {
  return (
    <Pressable
      onPress={() => press(disabled, disabledReason, onPress)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled, selected: active }}
      accessibilityHint={disabled ? disabledReason : undefined}
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
  /** Shown when the dimmed button is tapped: what the user has to do first. */
  disabledReason?: string;
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
  disabledReason,
  active = false,
  size = STUDIO.iconButton,
  accessibilityLabel,
  style,
  primary = false,
}: IconProps) {
  const circle = { width: size, height: size, borderRadius: size / 2 };
  const inner = (
    <Pressable
      onPress={() => press(disabled, disabledReason, onPress)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, selected: active }}
      accessibilityHint={disabled ? disabledReason : undefined}
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
