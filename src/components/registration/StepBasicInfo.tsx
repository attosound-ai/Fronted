import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Keyboard } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';

import { Text, Button, Input, PhoneInput } from '@/components/ui';
import { StepProps } from '@/types/registration';
import { isNotEmpty, isValidEmail, isValidPhoneNumber } from '@/utils/validators';

/**
 * StepBasicInfo - Step 1 of registration wizard
 * Collects user's name, email, and phone number
 */
export function StepBasicInfo({
  state,
  dispatch,
  onNext,
  onBack,
  isLoading,
  apiError,
}: StepProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateAndContinue = () => {
    const newErrors: Record<string, string> = {};

    if (!isNotEmpty(state.name)) {
      newErrors.name = 'Name is required';
    }

    if (!isValidEmail(state.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!isValidPhoneNumber(state.phoneNumber)) {
      newErrors.phoneNumber = 'Please enter a valid phone number';
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length === 0) {
      onNext();
    }
  };

  return (
    <View style={styles.container}>
      <KeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        bottomOffset={16}
        onScrollBeginDrag={() => Keyboard.dismiss()}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            {onBack && (
              <TouchableOpacity
                onPress={onBack}
                style={styles.backButton}
                activeOpacity={0.7}
              >
                <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            )}
            <Text variant="h2" style={styles.title}>
              Enter your details to continue
            </Text>
          </View>
        </View>

        {/* API Error Banner */}
        {apiError && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={20} color="#EF4444" />
            <Text variant="small" style={styles.errorBannerText}>
              {apiError}
            </Text>
          </View>
        )}

        {/* Form Fields */}
        <View style={styles.form}>
          <Input
            label="Name"
            value={state.name}
            onChangeText={(value) => {
              dispatch({ type: 'UPDATE_FIELD', field: 'name', value });
              setErrors((prev) => ({ ...prev, name: '' }));
            }}
            placeholder="Enter your full name"
            error={errors.name}
            autoCapitalize="words"
            autoComplete="name"
          />

          <Input
            label="Email"
            value={state.email}
            onChangeText={(value) => {
              dispatch({ type: 'UPDATE_FIELD', field: 'email', value });
              setErrors((prev) => ({ ...prev, email: '' }));
            }}
            placeholder="Enter your email address"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            error={errors.email}
          />

          <PhoneInput
            label="Phone number"
            countryCode={state.phoneCountryCode}
            onCountryCodeChange={(value) =>
              dispatch({ type: 'UPDATE_FIELD', field: 'phoneCountryCode', value })
            }
            phoneNumber={state.phoneNumber}
            onPhoneNumberChange={(value) => {
              dispatch({ type: 'UPDATE_FIELD', field: 'phoneNumber', value });
              setErrors((prev) => ({ ...prev, phoneNumber: '' }));
            }}
            error={errors.phoneNumber}
          />
        </View>

        {/* Continue Button */}
        <View style={styles.footer}>
          <Button
            title="Continue"
            onPress={validateAndContinue}
            disabled={isLoading}
            loading={isLoading}
          />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: '#FFFFFF',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2A1515',
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 24,
  },
  errorBannerText: {
    color: '#EF4444',
    flex: 1,
  },
  form: {
    gap: 4,
  },
  footer: {
    marginTop: 20,
  },
});
