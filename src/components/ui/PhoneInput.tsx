import { useState } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { PostHogMaskView } from 'posthog-react-native';

import { Text } from './Text';
import { getCountryByDial } from '@/utils/countryCodes';

interface PhoneInputProps {
  countryCode: string;
  onCountryCodeChange: (code: string) => void;
  phoneNumber: string;
  onPhoneNumberChange: (number: string) => void;
  label?: string;
  error?: string;
}

export function PhoneInput({
  countryCode,
  phoneNumber,
  onPhoneNumberChange,
  label,
  error,
}: PhoneInputProps) {
  const { t } = useTranslation('common');
  const [isFocused, setIsFocused] = useState(false);

  const selectedCountry = getCountryByDial(countryCode);
  const prefix = `${selectedCountry?.flag ?? '🌐'} ${selectedCountry?.dial ?? countryCode}`;

  return (
    <View style={styles.container}>
      {label && (
        <Text variant="caption" style={styles.label}>
          {label}
        </Text>
      )}

      <PostHogMaskView>
        <View
          style={[
            styles.inputRow,
            isFocused && styles.focused,
            error && styles.errorBorder,
          ]}
        >
          <Text style={styles.prefix} maxFontSizeMultiplier={1.0}>
            {prefix}
          </Text>
          <TextInput
            style={styles.input}
            value={phoneNumber}
            onChangeText={onPhoneNumberChange}
            keyboardType="phone-pad"
            placeholder={t('phoneInput.placeholder')}
            placeholderTextColor="#666666"
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            maxFontSizeMultiplier={1.0}
          />
        </View>
      </PostHogMaskView>

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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111111',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: '#222222',
    gap: 10,
  },
  prefix: {
    fontSize: 15,
    color: '#FFFFFF',
    fontFamily: 'Archivo_400Regular',
    lineHeight: 20,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#FFFFFF',
    fontFamily: 'Archivo_400Regular',
    padding: 0,
    lineHeight: 20,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  focused: {
    borderColor: '#3B82F6',
  },
  errorBorder: {
    borderColor: '#EF4444',
  },
  error: {
    color: '#EF4444',
    marginTop: 4,
  },
});
