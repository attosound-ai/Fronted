import { View, TouchableOpacity, StyleSheet } from 'react-native';

import { Text } from '@/components/ui/Text';
import { haptic } from '@/lib/haptics/hapticService';
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
  disabled?: boolean;
}

export function DtmfKeypad({ onPressDigit, disabled = false }: DtmfKeypadProps) {
  const press = (digit: string) => {
    if (disabled) return;
    void haptic('selection');
    onPressDigit(digit);
  };

  return (
    <View style={styles.grid}>
      {ROWS.map((row) => (
        <View key={row.join('')} style={styles.row}>
          {row.map((digit) => (
            <TouchableOpacity
              key={digit}
              style={[styles.key, disabled && styles.keyDisabled]}
              onPress={() => press(digit)}
              disabled={disabled}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={digit}
            >
              <Text variant="h2" style={styles.keyLabel}>
                {digit}
              </Text>
            </TouchableOpacity>
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
    borderRadius: KEY_SIZE / 2,
    backgroundColor: COLORS.background.tertiary,
    borderWidth: 1,
    borderColor: COLORS.border.light,
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
