import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { AlertCircle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text, Button, Input, PhoneInput } from '@/components/ui';
import { StepProps } from '@/types/registration';
import { isValidEmail, isValidPhoneNumber } from '@/utils/validators';
import { haptic } from '@/lib/haptics/hapticService';
import { apiClient } from '@/lib/api/client';

/**
 * StepBasicInfo - Step 1 of registration wizard
 * Collects either email or phone number based on identifierMode
 *
 * Usage:
 *   <StepBasicInfo state={state} dispatch={dispatch} onNext={handleNext} onBack={handleBack} />
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
  const [checking, setChecking] = useState(false);

  const isEmailMode = state.identifierMode === 'email';

  const handleToggleMode = () => {
    const nextMode = isEmailMode ? 'phone' : 'email';

    dispatch({ type: 'UPDATE_FIELD', field: 'identifierMode', value: nextMode });

    if (isEmailMode) {
      // Switching to phone — clear email
      dispatch({ type: 'UPDATE_FIELD', field: 'email', value: '' });
    } else {
      // Switching to email — clear phone
      dispatch({ type: 'UPDATE_FIELD', field: 'phoneNumber', value: '' });
      dispatch({ type: 'UPDATE_FIELD', field: 'phoneCountryCode', value: '+1' });
    }

    setErrors({});
  };

  const validateAndContinue = async () => {
    const newErrors: Record<string, string> = {};

    if (isEmailMode) {
      if (!isValidEmail(state.email)) {
        newErrors.email = tv('emailInvalid');
      }
    } else if (!isValidPhoneNumber(state.phoneNumber)) {
      newErrors.phoneNumber = tv('phoneInvalid');
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      haptic('error');
      return;
    }

    // Check availability against backend for the active identifier only
    setChecking(true);
    try {
      if (isEmailMode) {
        const emailRes = await apiClient
          .get(`/auth/check-email?email=${encodeURIComponent(state.email)}`)
          .catch((e: { response?: { status: number } }) => e.response);

        if (emailRes?.status === 409) {
          newErrors.email = t('errors.emailTaken');
        } else if (emailRes?.status && emailRes.status >= 500) {
          newErrors.email = t('errors.serverError');
        }
      } else {
        const phone = `${state.phoneCountryCode}${state.phoneNumber}`;
        const phoneRes = await apiClient
          .get(`/auth/check-phone?phone=${encodeURIComponent(phone)}`)
          .catch((e: { response?: { status: number } }) => e.response);

        if (phoneRes?.status === 409) {
          newErrors.phoneNumber = t('errors.phoneTaken');
        } else if (phoneRes?.status && phoneRes.status >= 500) {
          newErrors.phoneNumber = t('errors.serverError');
        }
      }

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        haptic('error');
        return;
      }

      haptic('light');
      onNext();
    } catch (error: unknown) {
      const isNetwork =
        error instanceof Error &&
        (error.message === 'Network Error' || error.message.includes('timeout'));
      if (isNetwork) {
        const field = isEmailMode ? 'email' : 'phoneNumber';
        setErrors({ [field]: t('errors.networkError') });
        haptic('error');
      } else {
        // Unknown error — let the user continue, backend will validate on register
        haptic('light');
        onNext();
      }
    } finally {
      setChecking(false);
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
        {/* API Error Banner */}
        {apiError && (
          <View style={styles.errorBanner}>
            <AlertCircle size={20} color="#FFFFFF" strokeWidth={2.25} />
            <Text variant="small" style={styles.errorBannerText}>
              {apiError}
            </Text>
          </View>
        )}

        {/* Single identifier input */}
        <View style={styles.form}>
          {isEmailMode ? (
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
              textContentType="emailAddress"
              error={errors.email}
            />
          ) : (
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
          )}

          {/* Phone mode hint */}
          {isEmailMode && (
            <TouchableOpacity
              onPress={() =>
                Alert.alert(
                  t('basicInfo.phoneUnavailableTitle'),
                  t('basicInfo.phoneUnavailableMessage')
                )
              }
              style={styles.toggleContainer}
              activeOpacity={0.7}
            >
              <Text variant="small" style={styles.toggleText}>
                {t('basicInfo.usePhone')}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Continue Button */}
        <View style={styles.footer}>
          <Button
            title={t('common:buttons.continue')}
            onPress={validateAndContinue}
            disabled={isLoading || checking}
            loading={isLoading || checking}
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
  toggleContainer: {
    alignSelf: 'flex-start',
    paddingVertical: 12,
    marginTop: 4,
  },
  toggleText: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_700Bold',
    fontSize: 13,
  },
  footer: {
    marginTop: 20,
  },
});
