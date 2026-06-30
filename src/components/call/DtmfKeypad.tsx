import { View, TouchableOpacity, StyleSheet } from 'react-native';

import { Text } from '@/components/ui/Text';
import { GlassSurface } from '@/components/navigation/GlassSurface';
import { haptic } from '@/lib/haptics/hapticService';
import { playDtmfTone } from '@/lib/sound/callSounds';
import { COLORS, SPACING } from '@/constants/theme';

/**
 * Pure, SDK-agnostic DTMF dialpad. It knows nothing about Twilio, the call
 * store, or networking — it only renders a 4×3 grid and reports which key was
 * pressed via `onPressDigit`. The caller decides what to do with the digit
 * (e.g. forward it to the telephony adapter's `sendCallDigit`).
 */
const ROWS: ReadonlyArray<ReadonlyArray<string>> = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['*', '0', '#'],
];

interface DtmfKeypadProps {
  onPressDigit: (digit: string) => void;
  /**
   * Reports EVERY physical key tap — including taps that are dropped because
   * the keypad is `disabled` (call not yet connected). Kept separate from
   * `onPressDigit` (which only fires for live sends) so the caller can record
   * dropped taps, the biggest blind spot in the Securus "press 1" flow. The
   * component stays SDK/analytics-agnostic; it only reports the raw tap.
   */
  onKeyTap?: (digit: string, meta: { disabled: boolean }) => void;
  disabled?: boolean;
}

export function DtmfKeypad({
  onPressDigit,
  onKeyTap,
  disabled = false,
}: DtmfKeypadProps) {
  const press = (digit: string) => {
    // Report the raw tap FIRST, even when disabled, so a tap that goes nowhere
    // still leaves a trace.
    onKeyTap?.(digit, { disabled });
    if (disabled) return;
    void haptic('selection');
    playDtmfTone(digit); // authentic dual-tone, mixes over the live call
    onPressDigit(digit);
  };

  return (
    <View style={styles.grid}>
      {ROWS.map((row) => (
        <View key={row.join('')} style={styles.row}>
          {row.map((digit) => (
            <GlassSurface
              key={digit}
              radius={KEY_SIZE / 2}
              style={[styles.key, disabled && styles.keyDisabled]}
            >
              <TouchableOpacity
                style={styles.keyInner}
                onPress={() => press(digit)}
                // NOT `disabled` natively: a native-disabled Touchable swallows
                // the tap entirely, so a dropped "press 1" would leave no trace.
                // We keep the disabled LOOK (style + no active flash + a11y state)
                // but still receive onPress so `press` can report the dropped tap.
                activeOpacity={disabled ? 1 : 0.6}
                accessibilityRole="button"
                accessibilityLabel={digit}
                accessibilityState={{ disabled }}
              >
                <Text variant="h2" style={styles.keyLabel}>
                  {digit}
                </Text>
              </TouchableOpacity>
            </GlassSurface>
          ))}
        </View>
      ))}
    </View>
  );
}

const KEY_SIZE = 72;

const styles = StyleSheet.create({
  grid: {
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    gap: SPACING.xl,
  },
  key: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    // GlassSurface renders the frosted-glass fill + radius (same as the in-call
    // bar buttons); the key just sizes it. No solid background/border here.
  },
  keyInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyDisabled: {
    opacity: 0.4,
  },
  keyLabel: {
    color: COLORS.white,
  },
});
