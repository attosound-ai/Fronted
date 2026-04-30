import { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Phone, Mail, AlertCircle, SquarePen } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text, OtpInput, Input, Button, BottomSheet } from '@/components/ui';
import { StepProps } from '@/types/registration';
import { authService } from '@/lib/api/authService';
import { apiClient } from '@/lib/api/client';
import { useCountdown } from '@/hooks/useCountdown';
import { haptic } from '@/lib/haptics/hapticService';
import { isValidEmail } from '@/utils/validators';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';

const COOLDOWN_SECONDS = 60;

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

  const screenMountTimeRef = useRef(Date.now());
  const fillTimeRef = useRef<number | null>(null);

  // Track screen view
  useEffect(() => {
    screenMountTimeRef.current = Date.now();
    analytics.capture(ANALYTICS_EVENTS.OTP.SCREEN_VIEWED, {
      identifier_mode: state.identifierMode,
      has_email: !!state.email,
      has_phone: !!state.phoneNumber,
    });
  }, []);

  // Edit modal state
  const [editVisible, setEditVisible] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [editError, setEditError] = useState('');
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    countdown.start(COOLDOWN_SECONDS);
  }, []);

  // Auto-advance on 6 digits
  const hasAdvancedRef = useRef(false);
  useEffect(() => {
    if (state.otpCode.length === 6 && !hasAdvancedRef.current && !isLoading) {
      setOtpError(null);
      hasAdvancedRef.current = true;
      haptic('light');

      if (!fillTimeRef.current) {
        fillTimeRef.current = Date.now();
        const timeToFillMs = fillTimeRef.current - screenMountTimeRef.current;
        analytics.capture(ANALYTICS_EVENTS.OTP.TIME_TO_FILL, {
          time_ms: timeToFillMs,
          time_seconds: Math.round(timeToFillMs / 1000),
        });
      }
      analytics.capture(ANALYTICS_EVENTS.OTP.VERIFY_STARTED, {
        time_since_mount_ms: Date.now() - screenMountTimeRef.current,
      });

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

  const handleOtpTelemetry = useCallback(
    (event: string, data: Record<string, unknown>) => {
      analytics.capture(`otp_${event.replace('otp_', '')}`, {
        ...data,
        identifier_mode: state.identifierMode,
        screen_time_ms: Date.now() - screenMountTimeRef.current,
      });
    },
    [state.identifierMode]
  );

  const handleResendCode = async () => {
    if (countdown.isActive || isResending) return;
    setIsResending(true);
    setOtpError(null);
    analytics.capture(ANALYTICS_EVENTS.OTP.RESEND_PRESSED, {
      identifier_mode: state.identifierMode,
      time_since_mount_ms: Date.now() - screenMountTimeRef.current,
    });
    try {
      if (state.identifierMode === 'phone') {
        const fullPhone = `${state.phoneCountryCode}${state.phoneNumber}`;
        await authService.sendOtp({ phone: fullPhone, locale: i18n.language });
      } else {
        await authService.sendOtp({ email: state.email, locale: i18n.language });
      }
      dispatch({ type: 'UPDATE_FIELD', field: 'otpCode', value: '' });
      countdown.start(COOLDOWN_SECONDS);
      fillTimeRef.current = null; // Reset fill timer for new code
      analytics.capture(ANALYTICS_EVENTS.OTP.RESEND_SUCCESS, {
        identifier_mode: state.identifierMode,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('otp.resendFailed');
      setOtpError(message);
      analytics.capture(ANALYTICS_EVENTS.OTP.RESEND_FAILED, {
        identifier_mode: state.identifierMode,
        error: message,
      });
    } finally {
      setIsResending(false);
    }
  };

  // ── Edit identifier modal logic ──

  const openEditModal = () => {
    setEditValue(state.identifierMode === 'email' ? state.email : state.phoneNumber);
    setEditError('');
    setEditVisible(true);
    analytics.capture(ANALYTICS_EVENTS.OTP.EDIT_IDENTIFIER_OPENED, {
      identifier_mode: state.identifierMode,
    });
  };

  const handleEditSave = async () => {
    setEditError('');
    const trimmed = editValue.trim();

    if (state.identifierMode === 'email') {
      if (!isValidEmail(trimmed)) {
        setEditError(t('validation:emailInvalid'));
        return;
      }
      // Same email — no change needed
      if (trimmed.toLowerCase() === state.email.toLowerCase()) {
        setEditVisible(false);
        return;
      }

      setIsChecking(true);
      try {
        // Check availability
        const res = await apiClient
          .get(`/auth/check-email?email=${encodeURIComponent(trimmed)}`)
          .catch((e: { response?: { status: number } }) => e.response);

        if (res?.status === 409) {
          setEditError(t('errors.emailTaken'));
          return;
        }

        // Update state + send new OTP
        dispatch({ type: 'UPDATE_FIELD', field: 'email', value: trimmed });
        dispatch({ type: 'UPDATE_FIELD', field: 'otpCode', value: '' });
        await authService.sendOtp({ email: trimmed, locale: i18n.language });
        countdown.start(COOLDOWN_SECONDS);
        haptic('success');
        setEditVisible(false);
        fillTimeRef.current = null;
        analytics.capture(ANALYTICS_EVENTS.OTP.EDIT_IDENTIFIER_SAVED, {
          identifier_mode: state.identifierMode,
        });
      } catch {
        setEditError(t('errors.networkError'));
      } finally {
        setIsChecking(false);
      }
    }
    // Phone mode can be added here in the future
  };

  const maskedEmail = maskEmail(state.email);
  const maskedPhone = maskPhone(state.phoneCountryCode, state.phoneNumber);
  const isEmailMode = state.identifierMode === 'email';

  return (
    <View style={styles.container}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        bottomOffset={16}
        showsVerticalScrollIndicator={false}
      >
        {/* Tappable masked identifier with edit hint */}
        <TouchableOpacity
          style={styles.destinationsRow}
          onPress={openEditModal}
          activeOpacity={0.7}
        >
          {isEmailMode ? (
            <Mail size={14} color="#888888" strokeWidth={2.25} />
          ) : (
            <Phone size={14} color="#888888" strokeWidth={2.25} />
          )}
          <Text variant="body" style={styles.destinationText}>
            {isEmailMode ? state.email : maskedPhone}
          </Text>
          <SquarePen size={16} color="#FFFFFF" strokeWidth={2.25} />
        </TouchableOpacity>

        {apiError && (
          <View style={styles.errorBanner}>
            <AlertCircle size={20} color="#FFFFFF" strokeWidth={2.25} />
            <Text variant="small" style={styles.errorBannerText}>
              {apiError}
            </Text>
          </View>
        )}

        <View style={styles.otpContainer}>
          <OtpInput
            length={6}
            value={state.otpCode}
            onChange={handleOtpChange}
            error={otpError || undefined}
            autoFocus
            onTelemetry={handleOtpTelemetry}
          />
        </View>

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

      {/* Edit identifier modal */}
      <BottomSheet
        visible={editVisible}
        onClose={() => setEditVisible(false)}
        title={isEmailMode ? t('otp.editEmailTitle') : t('otp.editPhoneTitle')}
      >
        <View style={styles.editContent}>
          <Input
            value={editValue}
            onChangeText={(v: string) => {
              setEditValue(v);
              setEditError('');
            }}
            placeholder={t('otp.editEmailPlaceholder')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            autoFocus
            error={editError}
          />
          <Button
            title={t('otp.editSave')}
            onPress={handleEditSave}
            loading={isChecking}
            disabled={isChecking || !editValue.trim()}
          />
        </View>
      </BottomSheet>
    </View>
  );
}

function maskEmail(email: string): string {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const visible = local.slice(0, 3);
  return `${visible}***@${domain}`;
}

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
    gap: 8,
    marginBottom: 48,
  },
  destinationText: {
    color: '#AAAAAA',
    fontSize: 15,
    fontFamily: 'Archivo_500Medium',
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
  editContent: {
    gap: 16,
  },
});
