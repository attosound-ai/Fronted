import { useState } from 'react';
import {
  TextInput,
  View,
  StyleSheet,
  TextInputProps,
  ViewStyle,
  StyleProp,
  TextStyle,
} from 'react-native';

import { Text } from './Text';

interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
  style?: StyleProp<TextStyle>;
  rightElement?: React.ReactNode;
}

/**
 * Input - Componente de input reutilizable
 *
 * Principio SOLID:
 * - Single Responsibility: Solo maneja entrada de texto
 * - Interface Segregation: Props específicas para inputs
 */
export function Input({
  label,
  error,
  containerStyle,
  style,
  rightElement,
  ...props
}: InputProps) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <Text variant="caption" style={styles.label}>
          {label}
        </Text>
      )}
      <View style={styles.inputWrapper}>
        <TextInput
          style={[
            styles.input,
            isFocused && styles.inputFocused,
            error && styles.inputError,
            style,
          ]}
          placeholderTextColor="#666666"
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          maxFontSizeMultiplier={1.0}
          {...props}
        />
        {rightElement && <View style={styles.rightElement}>{rightElement}</View>}
      </View>
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
    marginBottom: 16,
  },
  label: {
    marginBottom: 6,
    color: '#AAAAAA',
  },
  inputWrapper: {
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    backgroundColor: '#111111',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 18,
    fontSize: 15,
    color: '#FFFFFF',
    fontFamily: 'Archivo_400Regular',
    borderWidth: 1,
    borderColor: '#222222',
    // Pin lineHeight so iOS doesn't grow the input's intrinsic height
    // from the OS fontScale. Required even with maxFontSizeMultiplier
    // because UIKit computes intrinsic size before the cap is applied.
    lineHeight: 20,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  inputFocused: {
    borderColor: '#FFFFFF',
  },
  inputError: {
    borderColor: '#EF4444',
  },
  rightElement: {
    position: 'absolute',
    right: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    color: '#EF4444',
    marginTop: 4,
  },
});
