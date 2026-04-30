import { useRef, useEffect, useCallback } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Animated,
  Platform,
  type NativeSyntheticEvent,
  type TextInputChangeEventData,
  type TextInputKeyPressEventData,
} from 'react-native';
import { PostHogMaskView } from 'posthog-react-native';

import { Text } from './Text';

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (code: string) => void;
  error?: string;
  autoFocus?: boolean;
  /** Deep telemetry callback for debugging autofill issues. */
  onTelemetry?: (event: string, data: Record<string, unknown>) => void;
}

/**
 * OtpInput — single hidden TextInput with visual digit cells.
 *
 * Uses UNCONTROLLED mode (no `value` prop) to avoid the iOS autofill
 * race condition where the controlled component reasserts the JS state
 * before onChangeText fires from native autofill injection.
 *
 * External value changes are synced via setNativeProps.
 */
export function OtpInput({
  length = 6,
  value,
  onChange,
  error,
  autoFocus = true,
  onTelemetry,
}: OtpInputProps) {
  const hiddenInputRef = useRef<TextInput>(null);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const prevLengthRef = useRef(0);
  const focusTimeRef = useRef<number>(0);
  const digitTimestampsRef = useRef<number[]>([]);
  const lastChangeRef = useRef<string>('');
  const digits = value.split('').concat(Array(length).fill('')).slice(0, length);

  // Sync external value changes into the native input (e.g., on resend/clear)
  useEffect(() => {
    if (hiddenInputRef.current && value !== lastChangeRef.current) {
      hiddenInputRef.current.setNativeProps({ text: value });
      lastChangeRef.current = value;
    }
  }, [value]);

  // Shake on error
  useEffect(() => {
    if (error) {
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]).start();
    }
  }, [error, shakeAnim]);

  // Ensure focus on mount
  useEffect(() => {
    if (autoFocus) {
      const timer = setTimeout(() => hiddenInputRef.current?.focus(), 150);
      return () => clearTimeout(timer);
    }
  }, [autoFocus]);

  const processText = useCallback(
    (text: string, source: 'changeText' | 'change') => {
      const cleaned = text.replace(/\D/g, '').slice(0, length);
      const prevLen = prevLengthRef.current;
      const newLen = cleaned.length;
      const timeSinceFocus = focusTimeRef.current ? Date.now() - focusTimeRef.current : 0;

      // Detect autofill: multiple digits arrive at once
      const digitsAdded = newLen - prevLen;
      if (digitsAdded >= length && prevLen === 0) {
        onTelemetry?.('otp_autofill_detected', {
          digits: newLen,
          time_since_focus_ms: timeSinceFocus,
          source,
        });
      } else if (digitsAdded > 1 && digitsAdded < length) {
        onTelemetry?.('otp_autofill_partial', {
          digits_added: digitsAdded,
          total_digits: newLen,
          time_since_focus_ms: timeSinceFocus,
          source,
        });
      } else if (digitsAdded === 1) {
        // Record timestamp for this digit
        digitTimestampsRef.current.push(Date.now());
      }

      onTelemetry?.('otp_input_change', {
        digit_count: newLen,
        digits_added: digitsAdded,
        time_since_focus_ms: timeSinceFocus,
        source,
      });

      if (newLen === length && prevLen < length) {
        onTelemetry?.('otp_completed', {
          time_since_focus_ms: timeSinceFocus,
          was_autofill: digitsAdded >= length,
          digit_timestamps: digitTimestampsRef.current,
        });
      }

      prevLengthRef.current = newLen;
      lastChangeRef.current = cleaned;
      onChange(cleaned);
    },
    [length, onChange, onTelemetry]
  );

  const handleChangeText = useCallback(
    (text: string) => processText(text, 'changeText'),
    [processText]
  );

  // Backup handler — iOS autofill sometimes fires onChange but not onChangeText
  const handleChange = useCallback(
    (e: NativeSyntheticEvent<TextInputChangeEventData>) => {
      const text = e.nativeEvent.text;
      // Only process if onChangeText didn't already handle it
      if (text !== lastChangeRef.current) {
        processText(text, 'change');
      }
    },
    [processText]
  );

  const handleFocus = useCallback(() => {
    focusTimeRef.current = Date.now();
    digitTimestampsRef.current = [];
    onTelemetry?.('otp_input_focused', { timestamp: Date.now() });
  }, [onTelemetry]);

  const handleBlur = useCallback(() => {
    const timeSinceFocus = focusTimeRef.current ? Date.now() - focusTimeRef.current : 0;
    onTelemetry?.('otp_input_blurred', {
      time_since_focus_ms: timeSinceFocus,
      digits_filled: prevLengthRef.current,
    });
  }, [onTelemetry]);

  const handleKeyPress = useCallback(
    (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      onTelemetry?.('otp_key_press', {
        key: e.nativeEvent.key,
        timestamp: Date.now(),
      });
    },
    [onTelemetry]
  );

  return (
    <PostHogMaskView>
      <View>
        {/* Visual cells (behind in z-order) */}
        <Animated.View
          style={[styles.container, { transform: [{ translateX: shakeAnim }] }]}
          pointerEvents="none"
        >
          {Array.from({ length }).map((_, index) => (
            <View
              key={index}
              style={[
                styles.cell,
                digits[index] ? styles.cellFilled : null,
                error ? styles.cellError : null,
                index === value.length ? styles.cellActive : null,
              ]}
            >
              <Text style={styles.cellText} maxFontSizeMultiplier={1.0}>
                {digits[index]}
              </Text>
            </View>
          ))}
        </Animated.View>

        {/* Hidden input — UNCONTROLLED (no value prop) for iOS autofill compatibility */}
        <TextInput
          ref={hiddenInputRef}
          defaultValue={value}
          onChangeText={handleChangeText}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyPress={handleKeyPress}
          keyboardType="number-pad"
          maxLength={length}
          autoFocus={autoFocus}
          caretHidden
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          style={styles.hiddenInput}
        />

        {error && (
          <Text variant="small" style={styles.error}>
            {error}
          </Text>
        )}
      </View>
    </PostHogMaskView>
  );
}

const styles = StyleSheet.create({
  hiddenInput: {
    ...StyleSheet.absoluteFillObject,
    ...Platform.select({
      // opacity must be > 0.015 for iOS Fabric to register touches.
      // 0.02 is invisible to the eye but keeps the input interactive.
      ios: { opacity: 0.02, color: 'transparent' },
      default: { opacity: 0 },
    }),
  },
  container: {
    flexDirection: 'row',
    gap: 8,
  },
  cell: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 8,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellFilled: {
    borderColor: '#FFFFFF',
  },
  cellActive: {
    borderColor: '#888888',
  },
  cellError: {
    borderColor: '#FFFFFF',
  },
  cellText: {
    fontSize: 20,
    color: '#FFFFFF',
    fontFamily: 'Archivo_600SemiBold',
    textAlign: 'center',
    // Archivo TTFs in this project ship with a patched descender (-420)
    // so the natural glyph box at fontSize 20 exceeds 20pt. Without an
    // explicit lineHeight large enough to fit the full descender, the
    // bottom of digits gets clipped inside the fixed-height cell.
    lineHeight: 30,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  error: {
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 8,
  },
});
