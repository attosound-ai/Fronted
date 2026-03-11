import { useState } from 'react';
import { View, TextInput, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { Text } from './Text';
import { BottomSheet } from './BottomSheet';
import { COUNTRY_CODES } from '@/utils/countryCodes';

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
  onCountryCodeChange,
  phoneNumber,
  onPhoneNumberChange,
  label,
  error,
}: PhoneInputProps) {
  const { t } = useTranslation('common');
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const selectedCountry = COUNTRY_CODES.find((c) => c.dial === countryCode);

  const handleSelectCountry = (dial: string) => {
    onCountryCodeChange(dial);
    setIsPickerOpen(false);
  };

  return (
    <View style={styles.container}>
      {label && (
        <Text variant="caption" style={styles.label}>
          {label}
        </Text>
      )}

      <View style={styles.row}>
        <TouchableOpacity
          style={[
            styles.countryPicker,
            isFocused && styles.focused,
            error && styles.errorBorder,
          ]}
          onPress={() => setIsPickerOpen(true)}
          activeOpacity={0.7}
        >
          <Text variant="body" style={styles.countryText}>
            {selectedCountry?.dial ?? countryCode}
          </Text>
          <Ionicons name="chevron-down" size={14} color="#666666" />
        </TouchableOpacity>

        <TextInput
          style={[styles.input, isFocused && styles.focused, error && styles.errorBorder]}
          value={phoneNumber}
          onChangeText={onPhoneNumberChange}
          keyboardType="phone-pad"
          placeholder={t('phoneInput.placeholder')}
          placeholderTextColor="#666666"
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />
      </View>

      {error && (
        <Text variant="small" style={styles.error}>
          {error}
        </Text>
      )}

      <BottomSheet
        visible={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        title={t('phoneInput.selectCountry')}
      >
        <FlatList
          data={COUNTRY_CODES}
          keyExtractor={(item) => `${item.code}-${item.dial}`}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.countryOption}
              onPress={() => handleSelectCountry(item.dial)}
              activeOpacity={0.7}
            >
              <Text variant="body" style={styles.flag}>
                {item.flag}
              </Text>
              <Text variant="body" style={styles.countryName}>
                {item.name}
              </Text>
              <Text variant="caption" style={styles.dialCode}>
                {item.dial}
              </Text>
            </TouchableOpacity>
          )}
        />
      </BottomSheet>
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
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  countryPicker: {
    backgroundColor: '#111111',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#222222',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  countryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Archivo_400Regular',
  },
  input: {
    flex: 1,
    backgroundColor: '#111111',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#FFFFFF',
    fontFamily: 'Archivo_400Regular',
    borderWidth: 1,
    borderColor: '#222222',
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
  countryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
    gap: 12,
  },
  flag: {
    fontSize: 20,
  },
  countryName: {
    color: '#FFFFFF',
    flex: 1,
  },
  dialCode: {
    color: '#888888',
  },
});
