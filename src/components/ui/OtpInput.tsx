import { useRef, useEffect } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Animated,
  Pressable,
} from 'react-native';

import { Text } from './Text';

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (code: string) => void;
  error?: string;
  autoFocus?: boolean;
}

/**
 * OtpInput — single hidden TextInput with visual digit cells.
 *
 * Uses one hidden TextInput that captures all keystrokes, avoiding the
 * "same digit won't trigger onChangeText" bug of per-cell TextInputs.
 * Tapping any cell focuses the hidden input. Swipe-to-dismiss works
 * because there's only one input and the parent can set keyboardDismissMode.
 */
export function OtpInput({
  length = 6,
  value,
  onChange,
  error,
  autoFocus = true,
}: OtpInputProps) {
  const hiddenInputRef = useRef<TextInput>(null);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const digits = value.split('').concat(Array(length).fill('')).slice(0, length);

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

  const handleChange = (text: string) => {
    const cleaned = text.replaceAll(/\D/g, '').slice(0, length);
    onChange(cleaned);
  };

  const focusInput = () => {
    hiddenInputRef.current?.focus();
  };

  return (
    <View>
      {/* Hidden input that captures all keyboard events */}
      <TextInput
        ref={hiddenInputRef}
        value={value}
        onChangeText={handleChange}
        keyboardType="number-pad"
        maxLength={length}
        autoFocus={autoFocus}
        caretHidden
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        style={styles.hiddenInput}
      />

      {/* Visual cells — tap anywhere to focus the hidden input */}
      <Pressable onPress={focusInput}>
        <Animated.View
          style={[styles.container, { transform: [{ translateX: shakeAnim }] }]}
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
              <Text style={styles.cellText}>{digits[index]}</Text>
            </View>
          ))}
        </Animated.View>
      </Pressable>

      {error && (
        <Text variant="small" style={styles.error}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 0,
    width: 0,
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
  },
  error: {
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 8,
  },
});
