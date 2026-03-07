import { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';

import { Text, Button, OtpInput } from '@/components/ui';
import { StepProps } from '@/types/registration';
import { authService } from '@/lib/api/authService';
import { useCountdown } from '@/hooks/useCountdown';

const COOLDOWN_SECONDS = 60;

/**
 * StepOtpVerification - Step 2 of registration wizard
 * Verifies phone via 6-digit OTP code
 */
export function StepOtpVerification({
  state,
  dispatch,
  onNext,
  isLoading,
  apiError,
}: StepProps) {
  const countdown = useCountdown();
  const [isResending, setIsResending] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  // Start countdown immediately — the SMS was just sent in Step 1
  useEffect(() => {
    countdown.start(COOLDOWN_SECONDS);
  }, []);

  // Clear local error when code reaches 6 digits
  useEffect(() => {
    if (state.otpCode.length === 6) {
      setOtpError(null);
    }
  }, [state.otpCode]);

  const handleResendCode = async () => {
    if (countdown.isActive || isResending) return;

    setIsResending(true);
    setOtpError(null);

    try {
      const fullPhone = `${state.phoneCountryCode}${state.phoneNumber}`;
      await authService.sendOtp({ phone: fullPhone });
      dispatch({ type: 'UPDATE_FIELD', field: 'otpCode', value: '' });
      countdown.start(COOLDOWN_SECONDS);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to resend code';
      setOtpError(message);
    } finally {
      setIsResending(false);
    }
  };

  const handleContinue = () => {
    if (state.otpCode.length !== 6) {
      setOtpError('Please enter the complete 6-digit code');
      return;
    }
    onNext();
  };

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
          Enter the code we sent to your phone
        </Text>

        {/* Phone display */}
        <Text variant="body" style={styles.emailText}>
          {state.phoneCountryCode}
          {state.phoneNumber}
        </Text>

        {/* API Error Banner */}
        {apiError && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={20} color="#EF4444" />
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
            onChange={(value) => {
              dispatch({ type: 'UPDATE_FIELD', field: 'otpCode', value });
              setOtpError(null);
            }}
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
              ? 'Sending...'
              : countdown.isActive
                ? `Resend code (${countdown.remaining}s)`
                : 'Resend code'}
          </Text>
        </TouchableOpacity>

        {/* Continue Button */}
        <View style={styles.buttonContainer}>
          <Button
            title="Continue"
            onPress={handleContinue}
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
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
  },
  title: {
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 12,
  },
  emailText: {
    color: '#888888',
    textAlign: 'center',
    marginBottom: 32,
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
  otpContainer: {
    marginBottom: 24,
  },
  resendContainer: {
    alignSelf: 'center',
    paddingVertical: 8,
  },
  resendText: {
    color: '#3B82F6',
    fontFamily: 'Poppins_600SemiBold',
  },
  resendTextDisabled: {
    color: '#666666',
  },
  buttonContainer: {
    marginTop: 32,
  },
});
