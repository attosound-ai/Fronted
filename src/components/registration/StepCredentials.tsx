import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { Text, Button, Input, Checkbox } from '@/components/ui';
import { StepProps } from '@/types/registration';
import { isStrongPassword } from '@/utils/validators';
import { haptic } from '@/lib/haptics/hapticService';

/**
 * StepCredentials - Step 2 of registration wizard
 * Collects password and legal consent
 */
export function StepCredentials({
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
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const bothFilled = state.password.length > 0 && confirmPassword.length > 0;
  const passwordsMatch = state.password === confirmPassword;

  const strengthChecks = {
    length: state.password.length >= 8,
    upper: /[A-Z]/.test(state.password),
    lower: /[a-z]/.test(state.password),
    number: /\d/.test(state.password),
  };

  const validateAndContinue = () => {
    const newErrors: Record<string, string> = {};

    if (!isStrongPassword(state.password)) {
      newErrors.password = tv('passwordWeak');
    }

    if (confirmPassword !== state.password) {
      newErrors.confirmPassword = tv('passwordMismatch');
    }

    if (!state.confirmLegalAge) {
      newErrors.confirmLegalAge = tv('legalAgeRequired');
    }

    if (!state.acceptTerms) {
      newErrors.acceptTerms = tv('termsRequired');
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
              {t('credentials.title')}
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
          <View>
            <Input
              label={t('credentials.passwordLabel')}
              value={state.password}
              onChangeText={(value: string) => {
                dispatch({ type: 'UPDATE_FIELD', field: 'password', value });
                setErrors((prev) => ({ ...prev, password: '' }));
              }}
              placeholder={t('credentials.passwordPlaceholder')}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="new-password"
              error={errors.password}
            />
            <TouchableOpacity
              style={styles.eyeToggle}
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={showPassword ? 'eye-off' : 'eye'}
                size={20}
                color="#888888"
              />
            </TouchableOpacity>
          </View>

          {state.password.length > 0 && (
            <View style={styles.strengthContainer}>
              {(
                [
                  [strengthChecks.length, tv('strengthLength')],
                  [strengthChecks.upper, tv('strengthUpper')],
                  [strengthChecks.lower, tv('strengthLower')],
                  [strengthChecks.number, tv('strengthNumber')],
                ] as [boolean, string][]
              ).map(([met, label]) => (
                <View key={label} style={styles.strengthRow}>
                  <Ionicons
                    name={met ? 'checkmark-circle' : 'ellipse-outline'}
                    size={14}
                    color={met ? '#FFFFFF' : '#555555'}
                  />
                  <Text variant="small" style={[styles.strengthText, met && styles.strengthMet]}>
                    {label}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <View>
            <Input
              label={t('credentials.confirmLabel')}
              value={confirmPassword}
              onChangeText={(value: string) => {
                setConfirmPassword(value);
                setErrors((prev) => ({ ...prev, confirmPassword: '' }));
              }}
              placeholder={t('credentials.confirmPlaceholder')}
              secureTextEntry={!showConfirm}
              autoCapitalize="none"
              autoComplete="new-password"
              error={bothFilled && !passwordsMatch ? tv('passwordMismatch') : errors.confirmPassword}
            />
            <TouchableOpacity
              style={styles.eyeToggle}
              onPress={() => setShowConfirm((v) => !v)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={showConfirm ? 'eye-off' : 'eye'}
                size={20}
                color="#888888"
              />
            </TouchableOpacity>
          </View>

          {bothFilled && passwordsMatch && (
            <Text variant="small" style={styles.matchSuccess}>
              {tv('passwordMatch')}
            </Text>
          )}

          {/* Spacer */}
          <View style={styles.spacer} />

          {/* Checkboxes */}
          <Checkbox
            checked={state.confirmLegalAge}
            onToggle={(value) => {
              dispatch({ type: 'UPDATE_FIELD', field: 'confirmLegalAge', value });
              setErrors((prev) => ({ ...prev, confirmLegalAge: '' }));
            }}
            label={t('credentials.legalAgeCheckbox')}
            error={errors.confirmLegalAge}
          />

          <Checkbox
            checked={state.acceptTerms}
            onToggle={(value) => {
              dispatch({ type: 'UPDATE_FIELD', field: 'acceptTerms', value });
              setErrors((prev) => ({ ...prev, acceptTerms: '' }));
            }}
            label={
              <Text variant="small" style={styles.checkboxLabel}>
                {t('credentials.termsPrefix')}{' '}
                <Text
                  variant="small"
                  style={styles.linkText}
                  onPress={() => Linking.openURL('https://attosound.com/terms')}
                >
                  {t('credentials.termsLink')}
                </Text>
                .
              </Text>
            }
            error={errors.acceptTerms}
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
  spacer: {
    height: 8,
  },
  checkboxLabel: {
    color: '#CCCCCC',
    lineHeight: 20,
  },
  linkText: {
    color: '#FFFFFF',
    textDecorationLine: 'underline',
  },
  eyeToggle: {
    position: 'absolute',
    right: 16,
    top: 22,
    bottom: 16,
    justifyContent: 'center',
  },
  strengthContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 6,
    marginTop: -8,
    marginBottom: 8,
  },
  strengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: '50%',
  },
  strengthText: {
    color: '#555555',
  },
  strengthMet: {
    color: '#FFFFFF',
  },
  matchSuccess: {
    color: '#FFFFFF',
    marginTop: -12,
    marginBottom: 8,
  },
  footer: {
    marginTop: 20,
  },
});
