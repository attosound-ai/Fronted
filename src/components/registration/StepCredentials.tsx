import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';

import { Text, Button, Input, Checkbox } from '@/components/ui';
import { StepProps } from '@/types/registration';
import { isStrongPassword } from '@/utils/validators';

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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const validateAndContinue = () => {
    const newErrors: Record<string, string> = {};

    if (!isStrongPassword(state.password)) {
      newErrors.password =
        'Password must be at least 8 characters with uppercase, lowercase, and a number';
    }

    if (confirmPassword !== state.password) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (!state.confirmLegalAge) {
      newErrors.confirmLegalAge = 'You must confirm you are of legal age';
    }

    if (!state.acceptTerms) {
      newErrors.acceptTerms = 'You must accept the Terms and Conditions';
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
              Create your password
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
          <View>
            <Input
              label="Password"
              value={state.password}
              onChangeText={(value: string) => {
                dispatch({ type: 'UPDATE_FIELD', field: 'password', value });
                setErrors((prev) => ({ ...prev, password: '' }));
              }}
              placeholder="Create a password (min 8 characters)"
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

          <View>
            <Input
              label="Confirm Password"
              value={confirmPassword}
              onChangeText={(value: string) => {
                setConfirmPassword(value);
                setErrors((prev) => ({ ...prev, confirmPassword: '' }));
              }}
              placeholder="Repeat your password"
              secureTextEntry={!showConfirm}
              autoCapitalize="none"
              autoComplete="new-password"
              error={errors.confirmPassword}
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

          {/* Spacer */}
          <View style={styles.spacer} />

          {/* Checkboxes */}
          <Checkbox
            checked={state.confirmLegalAge}
            onToggle={(value) => {
              dispatch({ type: 'UPDATE_FIELD', field: 'confirmLegalAge', value });
              setErrors((prev) => ({ ...prev, confirmLegalAge: '' }));
            }}
            label="I confirm that I am of legal age to use this platform."
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
                I have read and agree to the{' '}
                <Text
                  variant="small"
                  style={styles.linkText}
                  onPress={() => Linking.openURL('https://attosound.com/terms')}
                >
                  Terms and Conditions
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
  spacer: {
    height: 8,
  },
  checkboxLabel: {
    color: '#CCCCCC',
    lineHeight: 20,
  },
  linkText: {
    color: '#3B82F6',
    textDecorationLine: 'underline',
  },
  eyeToggle: {
    position: 'absolute',
    right: 16,
    top: 22,
    bottom: 16,
    justifyContent: 'center',
  },
  footer: {
    marginTop: 20,
  },
});
