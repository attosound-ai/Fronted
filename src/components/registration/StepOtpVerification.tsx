import { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { Text, OtpInput } from '@/components/ui';
import { StepProps } from '@/types/registration';
import { authService } from '@/lib/api/authService';
import { useCountdown } from '@/hooks/useCountdown';
import { haptic } from '@/lib/haptics/hapticService';

const COOLDOWN_SECONDS = 60;

/**
 * StepOtpVerification - Step 2 of registration wizard
 * Verifies phone + email via 6-digit OTP code
 */
export function StepOtpVerification({
  state,
  dispatch,
  onNext,
  isLoading,
  apiError,
}: StepProps) {
  const { t, i18n } = useTranslation(['registration', 'common', 'validation']);
  const countdown = useCountdown();
  const [isResending, setIsResending] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  // Start countdown immediately — the OTP was just sent in Step 1
  useEffect(() => {
    countdown.start(COOLDOWN_SECONDS);
  }, []);

  // Auto-advance when state.otpCode reaches 6 digits (works with both manual input and iOS AutoFill)
  const hasAdvancedRef = useRef(false);
  useEffect(() => {
    if (state.otpCode.length === 6 && !hasAdvancedRef.current && !isLoading) {
      setOtpError(null);
      hasAdvancedRef.current = true;
      haptic('light');
      // Small delay so the user sees the last digit fill in
      const timer = setTimeout(() => onNext(), 200);
      return () => clearTimeout(timer);
    }
    if (state.otpCode.length < 6) {
      hasAdvancedRef.current = false;
    }
  }, [state.otpCode, onNext, isLoading]);

  const handleOtpChange = useCallback(
    (value: string) => {
      dispatch({ type: 'UPDATE_FIELD', field: 'otpCode', value });
      setOtpError(null);
    },
    [dispatch]
  );

  const handleResendCode = async () => {
    if (countdown.isActive || isResending) return;

    setIsResending(true);
    setOtpError(null);

    try {
      const fullPhone = `${state.phoneCountryCode}${state.phoneNumber}`;
      await authService.sendOtp({ phone: fullPhone, email: state.email, locale: i18n.language });
      dispatch({ type: 'UPDATE_FIELD', field: 'otpCode', value: '' });
      countdown.start(COOLDOWN_SECONDS);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('otp.resendFailed');
      setOtpError(message);
    } finally {
      setIsResending(false);
    }
  };

  const maskedEmail = maskEmail(state.email);
  const maskedPhone = maskPhone(state.phoneCountryCode, state.phoneNumber);

  return (
    <View style={styles.container}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        bottomOffset={16}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <Text variant="h2" style={styles.title}>
          {t('otp.title')}
        </Text>

        {/* Destinations — single row */}
        <View style={styles.destinationsRow}>
          <Ionicons name="call-outline" size={14} color="#888888" />
          <Text variant="small" style={styles.destinationText}>
            {maskedPhone}
          </Text>
          <Text variant="small" style={styles.separator}>|</Text>
          <Ionicons name="mail-outline" size={14} color="#888888" />
          <Text variant="small" style={styles.destinationText}>
            {maskedEmail}
          </Text>
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

        {/* OTP Input */}
        <View style={styles.otpContainer}>
          <OtpInput
            length={6}
            value={state.otpCode}
            onChange={handleOtpChange}
            error={otpError || undefined}
            autoFocus
          />
        </View>

        {/* Resend Code */}
        <TouchableOpacity
          onPress={handleResendCode}
          disabled={countdown.isActive || isResending}
          activeOpacity={0.7}
          style={styles.resendContainer}
        >
          <Text
            variant="body"
            style={[
              styles.resendText,
              (countdown.isActive || isResending) && styles.resendTextDisabled,
            ]}
          >
            {isResending
              ? t('otp.sending')
              : countdown.isActive
                ? t('otp.resendCodeCountdown', { seconds: countdown.remaining })
                : t('otp.resendCode')}
          </Text>
        </TouchableOpacity>
      </KeyboardAwareScrollView>
    </View>
  );
}

/** Masks an email: dav***@gmail.com */
function maskEmail(email: string): string {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const visible = local.slice(0, 3);
  return `${visible}***@${domain}`;
}

/** Masks a phone: +57***0022 */
function maskPhone(countryCode: string, number: string): string {
  if (!number) return countryCode;
  const last4 = number.slice(-4);
  return `${countryCode}***${last4}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
  },
  title: {
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
  },
  destinationsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 32,
  },
  destinationText: {
    color: '#888888',
  },
  separator: {
    color: '#333333',
    marginHorizontal: 2,
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
  otpContainer: {
    marginBottom: 24,
  },
  resendContainer: {
    alignSelf: 'center',
    paddingVertical: 8,
  },
  resendText: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_600SemiBold',
  },
  resendTextDisabled: {
    color: '#666666',
  },
});
