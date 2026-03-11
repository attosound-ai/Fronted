import { useRef, useEffect } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Animated,
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
} from 'react-native';

import { Text } from './Text';

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (code: string) => void;
  error?: string;
  autoFocus?: boolean;
}

export function OtpInput({
  length = 6,
  value,
  onChange,
  error,
  autoFocus = true,
}: OtpInputProps) {
  const inputRefs = useRef<(TextInput | null)[]>([]);
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

  const handleChange = (text: string, index: number) => {
    // Handle paste of full code
    if (text.length > 1) {
      const pastedDigits = text.replaceAll(/\D/g, '').slice(0, length);
      onChange(pastedDigits);
      const focusIndex = Math.min(pastedDigits.length, length - 1);
      inputRefs.current[focusIndex]?.focus();
      return;
    }

    const newDigits = [...digits];
    newDigits[index] = text.replaceAll(/\D/g, '');
    const newCode = newDigits.join('').slice(0, length);
    onChange(newCode);

    if (text && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (
    e: NativeSyntheticEvent<TextInputKeyPressEventData>,
    index: number
  ) => {
    if (e.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      const newDigits = [...digits];
      newDigits[index - 1] = '';
      onChange(newDigits.join(''));
    }
  };

  return (
    <View>
      <Animated.View
        style={[styles.container, { transform: [{ translateX: shakeAnim }] }]}
      >
        {Array.from({ length }).map((_, index) => {
          return (
            <TextInput
              key={index}
              ref={(ref) => {
                inputRefs.current[index] = ref;
              }}
              style={[
                styles.cell,
                digits[index] ? styles.cellFilled : null,
                error ? styles.cellError : null,
              ]}
              value={digits[index]}
              onChangeText={(text) => handleChange(text, index)}
              onKeyPress={(e) => handleKeyPress(e, index)}
              keyboardType="number-pad"
              maxLength={index === 0 ? length : 1}
              autoFocus={autoFocus && index === 0}
              selectTextOnFocus
              caretHidden
              textContentType="oneTimeCode"
              autoComplete={index === 0 ? 'one-time-code' : 'off'}
            />
          );
        })}
      </Animated.View>

      {error && (
        <Text variant="small" style={styles.error}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
    textAlign: 'center',
    fontSize: 20,
    color: '#FFFFFF',
    fontFamily: 'Archivo_600SemiBold',
  },
  cellFilled: {
    borderColor: '#FFFFFF',
  },
  cellError: {
    borderColor: '#EF4444',
  },
  error: {
    color: '#EF4444',
    textAlign: 'center',
    marginTop: 8,
  },
});
