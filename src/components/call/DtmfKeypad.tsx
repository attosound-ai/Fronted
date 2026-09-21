import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassSurface, GLASS_TIER } from '@/components/navigation/GlassSurface';
import { haptic } from '@/lib/haptics/hapticService';
import { playDtmfTone } from '@/lib/sound/callSounds';

/**
 * DTMF dial pad drawn like the Apple Phone keypad: circular Liquid Glass keys,
 * the digit over its letter row, and the system font so the glyphs match the
 * ones people already know. It stays SDK agnostic: it knows nothing about
 * Twilio, the call store or networking, it only renders the 4 by 3 grid and
 * reports which key was pressed through `onPressDigit`.
 *
 * Metrics follow Apple's dial pad: 75 pt keys, 28 pt between columns, 14 pt
 * between rows, a 36 pt digit and a 10 pt letter row with wide tracking.
 */
const ROWS: readonly (readonly { digit: string; letters?: string }[])[] = [
  [{ digit: '1' }, { digit: '2', letters: 'ABC' }, { digit: '3', letters: 'DEF' }],
  [
    { digit: '4', letters: 'GHI' },
    { digit: '5', letters: 'JKL' },
    { digit: '6', letters: 'MNO' },
  ],
  [
    { digit: '7', letters: 'PQRS' },
    { digit: '8', letters: 'TUV' },
    { digit: '9', letters: 'WXYZ' },
  ],
  [{ digit: '*' }, { digit: '0', letters: '+' }, { digit: '#' }],
];

interface DtmfKeypadProps {
  onPressDigit: (digit: string) => void;
  /**
   * Reports EVERY physical key tap, including taps that are dropped because
   * the keypad is `disabled` (call not yet connected). Kept separate from
   * `onPressDigit` (which only fires for live sends) so the caller can record
   * dropped taps, the biggest blind spot in the Securus "press 1" flow. The
   * component stays agnostic of the SDK and of analytics: it only reports the
   * raw tap.
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
    playDtmfTone(digit); // authentic dual tone, mixes over the live call
    onPressDigit(digit);
  };

  return (
    <View style={[styles.grid, disabled && styles.gridDisabled]}>
      {ROWS.map((row) => (
        <View key={row.map((k) => k.digit).join('')} style={styles.row}>
          {row.map(({ digit, letters }) => (
            <Pressable
              key={digit}
              onPress={() => press(digit)}
              // NOT natively `disabled`: a disabled pressable swallows the tap
              // entirely, so a dropped "press 1" would leave no trace. The
              // disabled LOOK stays (dimmed grid, no press highlight, a11y
              // state) while `press` still receives and reports the tap.
              accessibilityRole="button"
              accessibilityLabel={digit}
              accessibilityHint={letters}
              accessibilityState={{ disabled }}
              style={styles.keyPressable}
            >
              {({ pressed }) => (
                <GlassSurface
                  radius={KEY_SIZE / 2}
                  glassStyle="clear"
                  tintColor={
                    GLASS_TIER === 'glass'
                      ? pressed && !disabled
                        ? KEY_TINT_PRESSED
                        : KEY_TINT
                      : undefined
                  }
                  style={styles.key}
                >
                  {/* The pre iOS 26 tiers get the same lift from a plain
                      overlay: the blur and the solid fill do not tint. */}
                  {GLASS_TIER !== 'glass' && (
                    <View
                      pointerEvents="none"
                      style={[
                        StyleSheet.absoluteFill,
                        styles.legacyFill,
                        pressed && !disabled && styles.legacyFillPressed,
                      ]}
                    />
                  )}
                  <View style={styles.keyContent}>
                    <Text
                      style={[styles.digit, digit === '*' && styles.asterisk]}
                      allowFontScaling={false}
                    >
                      {digit}
                    </Text>
                    {letters ? (
                      <Text style={styles.letters} allowFontScaling={false}>
                        {letters}
                      </Text>
                    ) : null}
                  </View>
                </GlassSurface>
              )}
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

const KEY_SIZE = 75;
const COLUMN_GAP = 28;
const ROW_GAP = 14;
/** Apple's keys read as a light fill over whatever sits behind the sheet. */
const KEY_TINT = 'rgba(255,255,255,0.14)';
const KEY_TINT_PRESSED = 'rgba(255,255,255,0.42)';

/** The dial pad is one of the few places that uses the system font on purpose:
 *  Apple's digits are SF Pro and the app's Archivo reads as a different keypad. */
const SYSTEM_FONT = Platform.select({ ios: undefined, default: 'sans-serif' });

const styles = StyleSheet.create({
  grid: {
    alignItems: 'center',
    gap: ROW_GAP,
  },
  gridDisabled: {
    opacity: 0.4,
  },
  row: {
    flexDirection: 'row',
    gap: COLUMN_GAP,
  },
  keyPressable: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    borderRadius: KEY_SIZE / 2,
  },
  key: {
    width: KEY_SIZE,
    height: KEY_SIZE,
  },
  legacyFill: {
    backgroundColor: KEY_TINT,
  },
  legacyFillPressed: {
    backgroundColor: KEY_TINT_PRESSED,
  },
  keyContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: {
    color: '#FFFFFF',
    fontFamily: SYSTEM_FONT,
    fontSize: 36,
    fontWeight: '400',
    lineHeight: 42,
    includeFontPadding: false,
    textAlign: 'center',
  },
  asterisk: {
    // The asterisk glyph hangs high in SF Pro, so Apple nudges it down to sit
    // on the same optical center as the digits.
    lineHeight: 52,
    fontSize: 38,
  },
  letters: {
    color: '#FFFFFF',
    fontFamily: SYSTEM_FONT,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 2,
    lineHeight: 12,
    marginTop: 1,
    includeFontPadding: false,
    textAlign: 'center',
  },
});
