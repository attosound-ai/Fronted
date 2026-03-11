import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  TouchableOpacity,
  Switch,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { OtpInput } from '@/components/ui/OtpInput';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ProfileSection } from './ProfileSection';
import { ProfileInfoRow } from './ProfileInfoRow';
import { authService } from '@/lib/api/authService';
import { useAuthStore } from '@/stores/authStore';
import type { User, TwoFactorMethod } from '@/types';

type FlowState = 'idle' | 'choose_method' | 'verify_otp' | 'confirm_disable';

interface ProfileSecuritySectionProps {
  user: User;
}

export function ProfileSecuritySection({ user }: ProfileSecuritySectionProps) {
  const { t } = useTranslation('profile');
  const setUser = useAuthStore((s) => s.setUser);

  const [flowState, setFlowState] = useState<FlowState>('idle');
  const [method, setMethod] = useState<TwoFactorMethod>('sms');
  const [maskedTarget, setMaskedTarget] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const is2FAEnabled = user.twoFactorEnabled;

  const handleToggle = useCallback(() => {
    setError('');
    if (is2FAEnabled) {
      setFlowState('confirm_disable');
    } else {
      setFlowState('choose_method');
    }
  }, [is2FAEnabled]);

  const handleClose = useCallback(() => {
    setFlowState('idle');
    setOtpCode('');
    setPassword('');
    setError('');
  }, []);

  const handleSelectMethod = useCallback(async (selected: TwoFactorMethod) => {
    setMethod(selected);
    setError('');
    setLoading(true);
    try {
      const { maskedTarget: target } = await authService.enable2FA({ method: selected });
      setMaskedTarget(target);
      setFlowState('verify_otp');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('security.errorFailedToSendCode'));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleConfirmEnable = useCallback(async () => {
    if (otpCode.length !== 6) return;
    setError('');
    setLoading(true);
    try {
      await authService.confirm2FA({ code: otpCode, method });
      const me = await authService.getMe();
      setUser(me);
      handleClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('security.errorInvalidCode'));
    } finally {
      setLoading(false);
    }
  }, [otpCode, method, setUser, handleClose]);

  const handleConfirmDisable = useCallback(async () => {
    if (!password) return;
    setError('');
    setLoading(true);
    try {
      await authService.disable2FA({ password });
      const me = await authService.getMe();
      setUser(me);
      handleClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('security.errorFailedToDisable'));
    } finally {
      setLoading(false);
    }
  }, [password, setUser, handleClose]);

  const methodLabel =
    user.twoFactorMethod === 'email'
      ? t('security.methodEmail')
      : t('security.methodSms');

  return (
    <>
      <ProfileSection title={t('security.sectionTitle')}>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#888888" />
            <Text variant="body" style={styles.label}>
              {t('security.twoFactorLabel')}
            </Text>
          </View>
          <Switch
            value={is2FAEnabled}
            onValueChange={handleToggle}
            trackColor={{ false: '#333333', true: '#3B82F6' }}
            thumbColor="#FFFFFF"
          />
        </View>
        {is2FAEnabled && (
          <ProfileInfoRow
            icon="chatbubble-outline"
            label={t('security.methodLabel')}
            value={methodLabel}
            showDivider={false}
          />
        )}
      </ProfileSection>

      {/* Choose method sheet */}
      <BottomSheet
        visible={flowState === 'choose_method'}
        onClose={handleClose}
        title={t('security.chooseMethodTitle')}
      >
        <View style={styles.sheetContent}>
          {error ? (
            <Text variant="small" style={styles.error}>
              {error}
            </Text>
          ) : null}

          {loading ? (
            <ActivityIndicator color="#3B82F6" size="large" style={styles.loader} />
          ) : (
            <View style={styles.methodOptions}>
              <TouchableOpacity
                style={styles.methodOption}
                onPress={() => handleSelectMethod('sms')}
                activeOpacity={0.7}
              >
                <Ionicons name="phone-portrait-outline" size={24} color="#3B82F6" />
                <Text variant="body" style={styles.methodText}>
                  {t('security.smsOptionLabel')}
                </Text>
                <Text variant="small" style={styles.methodDesc}>
                  {t('security.smsOptionDesc')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.methodOption}
                onPress={() => handleSelectMethod('email')}
                activeOpacity={0.7}
              >
                <Ionicons name="mail-outline" size={24} color="#3B82F6" />
                <Text variant="body" style={styles.methodText}>
                  {t('security.emailOptionLabel')}
                </Text>
                <Text variant="small" style={styles.methodDesc}>
                  {t('security.emailOptionDesc')}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </BottomSheet>

      {/* Verify OTP sheet */}
      <BottomSheet
        visible={flowState === 'verify_otp'}
        onClose={handleClose}
        title={t('security.verifyIdentityTitle')}
      >
        <View style={styles.sheetContent}>
          <Text variant="body" style={styles.sheetSubtitle}>
            {t('security.verifyIdentitySubtitle', { target: maskedTarget })}
          </Text>

          {error ? (
            <Text variant="small" style={styles.error}>
              {error}
            </Text>
          ) : null}

          <OtpInput
            value={otpCode}
            onChange={(code) => {
              setOtpCode(code);
              setError('');
            }}
            error={error || undefined}
          />

          <Button
            title={t('security.confirmButton')}
            onPress={handleConfirmEnable}
            loading={loading}
            disabled={otpCode.length !== 6}
          />
        </View>
      </BottomSheet>

      {/* Disable 2FA sheet */}
      <BottomSheet
        visible={flowState === 'confirm_disable'}
        onClose={handleClose}
        title={t('security.disableTwoFactorTitle')}
      >
        <View style={styles.sheetContent}>
          <Text variant="body" style={styles.sheetSubtitle}>
            {t('security.disableTwoFactorSubtitle')}
          </Text>

          {error ? (
            <Text variant="small" style={styles.error}>
              {error}
            </Text>
          ) : null}

          <Input
            placeholder={t('security.passwordPlaceholder')}
            value={password}
            onChangeText={(v: string) => {
              setPassword(v);
              setError('');
            }}
            secureTextEntry
            autoCapitalize="none"
          />

          <Button
            title={t('security.disable2faButton')}
            onPress={handleConfirmDisable}
            loading={loading}
            disabled={!password}
          />
        </View>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#222222',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  label: {
    color: '#888888',
  },
  sheetContent: {
    gap: 16,
  },
  sheetSubtitle: {
    color: '#888888',
    textAlign: 'center',
  },
  error: {
    color: '#EF4444',
    textAlign: 'center',
  },
  loader: {
    paddingVertical: 24,
  },
  methodOptions: {
    gap: 12,
  },
  methodOption: {
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  methodText: {
    color: '#FFFFFF',
    flex: 1,
  },
  methodDesc: {
    color: '#888888',
  },
});
