import { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  TextInput,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Eye, EyeOff } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui/Text';
import { useAccountStore } from '@/stores/accountStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { OtpInput } from '@/components/ui/OtpInput';
import { useAuthStore } from '@/stores/authStore';
import { haptic } from '@/lib/haptics/hapticService';

type Step = 'identifier' | 'password' | '2fa';

export default function LoginScreen() {
  const { t } = useTranslation('auth');
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isAddMode = mode === 'add';
  const addAccount = useAccountStore((s) => s.addAccount);
  const switchToAccount = useAccountStore((s) => s.switchToAccount);

  const [step, setStep] = useState<Step>('identifier');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [identifierError, setIdentifierError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otpCode, setOtpCode] = useState('');

  const login = useAuthStore((s) => s.login);
  const isAuthenticating = useAuthStore((s) => s.isAuthenticating);
  const authError = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);
  const pending2FA = useAuthStore((s) => s.pending2FA);
  const verify2FALogin = useAuthStore((s) => s.verify2FALogin);
  const clearPending2FA = useAuthStore((s) => s.clearPending2FA);

  useFocusEffect(
    useCallback(() => {
      clearError();
    }, [clearError])
  );

  const goToStep = useCallback((next: Step) => {
    setStep(next);
  }, []);

  const handleContinue = useCallback(() => {
    setIdentifierError('');
    clearError();
    if (identifier.trim().length < 3) {
      setIdentifierError(t('login.identifierError'));
      haptic('error');
      return;
    }
    goToStep('password');
  }, [identifier, clearError, t, goToStep]);

  const handleLogin = useCallback(async () => {
    setPasswordError('');
    clearError();
    if (password.length < 8) {
      setPasswordError(t('login.passwordError'));
      haptic('error');
      return;
    }

    try {
      if (isAddMode) {
        const prev = useAuthStore.getState();
        if (prev.user && prev.tokens) {
          await addAccount({ user: prev.user, tokens: prev.tokens });
        }
      }

      await login({ identifier: identifier.trim(), password });

      if (!useAuthStore.getState().pending2FA) {
        await haptic('light');
        if (isAddMode) {
          const { user: newUser, tokens: newTokens } = useAuthStore.getState();
          if (newUser && newTokens) {
            await addAccount({ user: newUser, tokens: newTokens });
            await switchToAccount(newUser.id);
          }
        }
        router.replace('/(tabs)');
      } else {
        goToStep('2fa');
      }
    } catch {
      haptic('error');
    }
  }, [
    password,
    identifier,
    login,
    clearError,
    t,
    goToStep,
    isAddMode,
    addAccount,
    switchToAccount,
  ]);

  const handleVerify2FA = useCallback(async () => {
    if (otpCode.length !== 6) return;
    clearError();
    try {
      if (isAddMode) {
        const prev = useAuthStore.getState();
        if (prev.user && prev.tokens) {
          await addAccount({ user: prev.user, tokens: prev.tokens });
        }
      }

      await verify2FALogin(otpCode);
      await haptic('light');

      if (isAddMode) {
        const { user: newUser, tokens: newTokens } = useAuthStore.getState();
        if (newUser && newTokens) {
          await addAccount({ user: newUser, tokens: newTokens });
          await switchToAccount(newUser.id);
        }
      }
      router.replace('/(tabs)');
    } catch {
      haptic('error');
    }
  }, [otpCode, verify2FALogin, clearError, isAddMode, addAccount, switchToAccount]);

  const handleBack = useCallback(() => {
    clearError();
    if (step === 'identifier') {
      router.replace('/(auth)/welcome');
    } else if (step === 'password') {
      setPasswordError('');
      goToStep('identifier');
    } else if (step === '2fa') {
      setOtpCode('');
      clearPending2FA();
      goToStep('password');
    }
  }, [step, clearError, clearPending2FA, goToStep]);

  const stepTitle = {
    identifier: t('login.identifierTitle'),
    password: t('login.passwordTitle'),
    '2fa': t('twoFactor.title'),
  }[step];

  const renderStep = () => {
    switch (step) {
      case 'identifier':
        return (
          <View style={styles.stepContent}>
            {authError && (
              <Text variant="small" style={styles.apiError}>
                {authError}
              </Text>
            )}

            <Input
              placeholder={t('login.identifierPlaceholder')}
              value={identifier}
              onChangeText={(v: string) => {
                setIdentifier(v);
                setIdentifierError('');
                clearError();
              }}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              keyboardType="email-address"
              autoFocus
              error={identifierError}
              onSubmitEditing={handleContinue}
              returnKeyType="next"
            />

            <Button
              title={t('login.continue')}
              onPress={handleContinue}
              disabled={identifier.trim().length < 3}
            />
          </View>
        );

      case 'password':
        return (
          <View style={styles.stepContent}>
            {authError && (
              <Text variant="small" style={styles.apiError}>
                {authError}
              </Text>
            )}

            {/*
              Hidden username field. iOS Password AutoFill only offers a
              saved credential when a username input with the matching
              content type is present on the same screen as the password
              field. Without this, the QuickType bar suggests unrelated
              emails from Contacts instead of the saved password.
              The field is off-screen but focusable so iOS recognizes it
              as part of the form.
            */}
            <TextInput
              value={identifier}
              editable={false}
              autoComplete="username"
              textContentType="username"
              importantForAutofill="yes"
              style={styles.hiddenUsername}
              accessibilityElementsHidden
              aria-hidden
            />

            <Input
              placeholder={t('login.passwordPlaceholder')}
              value={password}
              onChangeText={(v: string) => {
                setPassword(v);
                setPasswordError('');
                clearError();
              }}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="password"
              textContentType="password"
              autoFocus
              error={passwordError}
              onSubmitEditing={handleLogin}
              returnKeyType="done"
              style={{ paddingRight: 48 }}
              rightElement={
                <TouchableOpacity
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  {showPassword ? (
                    <EyeOff size={20} color="#888888" strokeWidth={2.25} />
                  ) : (
                    <Eye size={20} color="#888888" strokeWidth={2.25} />
                  )}
                </TouchableOpacity>
              }
            />

            <Button
              title={t('login.signIn')}
              onPress={handleLogin}
              loading={isAuthenticating}
              disabled={isAuthenticating || password.length < 3}
            />

            <TouchableOpacity
              style={styles.forgotRow}
              onPress={() => router.push('/(auth)/forgot-password')}
            >
              <Text style={styles.forgotLink}>{t('login.forgotPassword')}</Text>
            </TouchableOpacity>
          </View>
        );

      case '2fa':
        return (
          <View style={styles.stepContent}>
            <Text variant="body" style={styles.subtitle}>
              {t('twoFactor.subtitle', { maskedTarget: pending2FA?.maskedTarget })}
            </Text>

            {authError && (
              <Text variant="small" style={styles.apiError}>
                {authError}
              </Text>
            )}

            <OtpInput
              value={otpCode}
              onChange={(code) => {
                setOtpCode(code);
                clearError();
              }}
              error={authError || undefined}
            />

            <Button
              title={t('twoFactor.verify')}
              onPress={handleVerify2FA}
              loading={isAuthenticating}
              disabled={otpCode.length !== 6}
            />
          </View>
        );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleBack}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ChevronLeft size={24} color="#FFFFFF" strokeWidth={2.25} />
        </TouchableOpacity>
        <Text variant="h2" style={styles.headerTitle}>
          {stepTitle}
        </Text>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.content}>{renderStep()}</View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  keyboardAvoid: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  stepContent: {
    gap: 16,
  },
  headerTitle: {
    color: '#FFFFFF',
    marginLeft: 12,
    flex: 1,
  },
  subtitle: {
    color: '#888888',
    textAlign: 'center',
    marginBottom: 8,
  },
  apiError: {
    color: '#EF4444',
  },
  forgotRow: {
    alignSelf: 'center',
    marginTop: 4,
  },
  forgotLink: {
    color: '#888888',
    fontFamily: 'Archivo_400Regular',
    fontSize: 14,
  },
  // Off-screen + zero-size — still focusable so iOS treats it as part of
  // the form for Password AutoFill pairing.
  hiddenUsername: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    top: -1000,
    left: -1000,
  },
});
