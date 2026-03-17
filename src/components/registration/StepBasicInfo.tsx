import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { Text, Button, Input, PhoneInput } from '@/components/ui';
import { StepProps } from '@/types/registration';
import { isNotEmpty, isValidEmail, isValidPhoneNumber } from '@/utils/validators';
import { haptic } from '@/lib/haptics/hapticService';

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
  const { t } = useTranslation(['registration', 'common']);
  const { t: tv } = useTranslation('validation');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateAndContinue = () => {
    const newErrors: Record<string, string> = {};

    if (!isNotEmpty(state.name)) {
      newErrors.name = tv('nameRequired');
    }

    if (!isValidEmail(state.email)) {
      newErrors.email = tv('emailInvalid');
    }

    if (!isValidPhoneNumber(state.phoneNumber)) {
      newErrors.phoneNumber = tv('phoneInvalid');
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length === 0) {
      haptic('light');
      onNext();
    } else {
      haptic('error');
    }
  };

  return (
    <View style={styles.container}>
      <KeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        bottomOffset={16}
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
              {t('basicInfo.title')}
            </Text>
          </View>
        </View>

        {/* API Error Banner */}
        {apiError && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={20} color="#FFFFFF" />
            <Text variant="small" style={styles.errorBannerText}>
              {apiError}
            </Text>
          </View>
        )}

        {/* Form Fields */}
        <View style={styles.form}>
          <Input
            label={t('basicInfo.nameLabel')}
            value={state.name}
            onChangeText={(value) => {
              dispatch({ type: 'UPDATE_FIELD', field: 'name', value });
              setErrors((prev) => ({ ...prev, name: '' }));
            }}
            placeholder={t('basicInfo.namePlaceholder')}
            error={errors.name}
            autoCapitalize="words"
            autoComplete="name"
          />

          <Input
            label={t('basicInfo.emailLabel')}
            value={state.email}
            onChangeText={(value) => {
              dispatch({ type: 'UPDATE_FIELD', field: 'email', value });
              setErrors((prev) => ({ ...prev, email: '' }));
            }}
            placeholder={t('basicInfo.emailPlaceholder')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            error={errors.email}
          />

          <PhoneInput
            label={t('basicInfo.phoneLabel')}
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
            title={t('common:buttons.continue')}
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
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 24,
  },
  errorBannerText: {
    color: '#FFFFFF',
    flex: 1,
  },
  form: {
    gap: 4,
  },
  footer: {
    marginTop: 20,
  },
});
