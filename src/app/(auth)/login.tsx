import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui/Text';
import { useAccountStore } from '@/stores/accountStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { OtpInput } from '@/components/ui/OtpInput';
import { LanguageSelectorButton } from '@/components/ui/LanguageSelectorButton';
import { Logo } from '@/components/ui/Logo';
import { useAuthStore } from '@/stores/authStore';
import { haptic } from '@/lib/haptics/hapticService';

type Step = 'credentials' | '2fa';

export default function LoginScreen() {
  const { t } = useTranslation('auth');
  const insets = useSafeAreaInsets();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isAddMode = mode === 'add';
  const addAccount = useAccountStore((s) => s.addAccount);
  const switchToAccount = useAccountStore((s) => s.switchToAccount);
  const [step, setStep] = useState<Step>('credentials');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [identifierError, setIdentifierError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const keyboardProgress = useRef(new Animated.Value(0)).current;
  const { height: screenHeight } = useWindowDimensions();
  // iPhone 17 Pro / 16 Pro = 874pt. Threshold 930 covers all non-Max iPhones.
  // 150pt container: waveform SVG content sits within 24–94pt of the 160pt bounding box
  // so nothing gets clipped visually. Moves the KAV 34pt higher → clears the keyboard.
  const logoBaseHeight = screenHeight < 930 ? 150 : 184;

  // Animate logo section: taller when keyboard hidden (pushes form down),
  // original height when keyboard open (no visual change).
  const logoContainerHeight = keyboardProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [logoBaseHeight + 80, logoBaseHeight],
  });

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvent, (e) => {
      const duration = e.duration > 0 ? e.duration : 250;
      Animated.timing(keyboardProgress, {
        toValue: 1,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    });
    const onHide = Keyboard.addListener(hideEvent, (e) => {
      const duration = e.duration > 0 ? e.duration : 250;
      Animated.timing(keyboardProgress, {
        toValue: 0,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    });
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [keyboardProgress]);

  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;

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

  const animateIn = useCallback(() => {
    opacity.setValue(0);
    translateY.setValue(30);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [opacity, translateY]);

  // Transition to 2FA step when pending2FA is set
  useEffect(() => {
    if (pending2FA && step === 'credentials') {
      setStep('2fa');
      animateIn();
    }
  }, [pending2FA, step, animateIn]);

  const handleLogin = useCallback(async () => {
    setIdentifierError('');
    setPasswordError('');
    clearError();

    let valid = true;
    if (!identifier.trim()) {
      setIdentifierError(t('login.identifierError'));
      valid = false;
    }
    if (password.length < 8) {
      setPasswordError(t('login.passwordError'));
      valid = false;
    }
    if (!valid) {
      haptic('error');
      return;
    }

    try {
      // In add mode, persist the CURRENT account before login overwrites it
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
          // Now persist the NEW account and switch to it
          const { user: newUser, tokens: newTokens } = useAuthStore.getState();
          if (newUser && newTokens) {
            await addAccount({ user: newUser, tokens: newTokens });
            await switchToAccount(newUser.id);
          }
        }
        router.replace('/(tabs)');
      }
    } catch {
      haptic('error');
    }
  }, [
    identifier,
    password,
    login,
    clearError,
    t,
    isAddMode,
    addAccount,
    switchToAccount,
  ]);

  const handleVerify2FA = useCallback(async () => {
    if (otpCode.length !== 6) return;
    clearError();
    try {
      // In add mode, persist current account before 2FA overwrites it
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
    if (step === 'credentials') {
      router.back();
    } else if (step === '2fa') {
      setOtpCode('');
      clearPending2FA();
      setStep('credentials');
      animateIn();
    }
  }, [step, clearError, clearPending2FA, animateIn]);

  const renderStep = () => {
    switch (step) {
      case 'credentials':
        return (
          <View style={styles.form}>
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
              autoComplete="username"
              error={identifierError}
              onSubmitEditing={() => {}}
              returnKeyType="next"
            />

            <View>
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
                error={passwordError}
                onSubmitEditing={handleLogin}
                returnKeyType="done"
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

            <Button
              title={t('login.signIn')}
              onPress={handleLogin}
              loading={isAuthenticating}
              disabled={
                isAuthenticating || identifier.trim().length < 3 || password.length < 3
              }
            />

            <TouchableOpacity
              style={styles.forgotRow}
              onPress={() => router.push('/(auth)/forgot-password')}
            >
              <Text variant="caption" style={styles.forgotLink}>
                {t('login.forgotPassword')}
              </Text>
            </TouchableOpacity>
          </View>
        );

      case '2fa':
        return (
          <View style={styles.form}>
            <View style={styles.shieldIcon}>
              <Ionicons name="shield-checkmark" size={64} color="#3B82F6" />
            </View>

            <Text variant="h2" style={styles.twoFaTitle}>
              {t('twoFactor.title')}
            </Text>
            <Text variant="body" style={styles.twoFaSubtitle}>
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
        {step === '2fa' ? (
          <TouchableOpacity
            onPress={handleBack}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}
        <LanguageSelectorButton />
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="on-drag"
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          {step === 'credentials' && (
            <Animated.View
              style={[styles.logoSection, { height: logoContainerHeight }]}
            >
              <Animated.View
                style={{
                  transform: [
                    {
                      scale: keyboardProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 0.4],
                        extrapolate: 'clamp',
                      }),
                    },
                  ],
                }}
              >
                <Logo size={160} animated />
              </Animated.View>
            </Animated.View>
          )}

          <View style={styles.keyboardInner}>
            <View style={{ flex: 1 }} />
            <Animated.View style={{ opacity, transform: [{ translateY }] }}>
              {renderStep()}
            </Animated.View>
            <View style={{ flex: 5 }} />
          </View>

          {step === 'credentials' && (
            <TouchableOpacity
              style={styles.signUpRow}
              onPress={() => {
                haptic('light');
                router.push('/(auth)/register');
              }}
              activeOpacity={0.6}
            >
              <Text variant="caption" style={styles.helpText}>
                {t('welcome.noAccount')}{' '}
              </Text>
              <Text variant="caption" style={styles.signUpLink}>
                {t('welcome.signUp')}
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  keyboardInner: {
    flex: 1,
    paddingHorizontal: 24,
  },
  logoSection: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  form: {
    gap: 16,
  },
  apiError: {
    color: '#EF4444',
    textAlign: 'center',
  },
  eyeToggle: {
    position: 'absolute',
    right: 16,
    top: 0,
    bottom: 16,
    justifyContent: 'center',
  },
  forgotRow: {
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  forgotLink: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_500Medium',
  },
  helpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  helpText: {
    color: '#888888',
  },
  helpLink: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_700Bold',
  },
  signUpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  signUpLink: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_700Bold',
  },
  shieldIcon: {
    alignItems: 'center',
    marginBottom: 8,
  },
  twoFaTitle: {
    color: '#FFFFFF',
    textAlign: 'center',
  },
  twoFaSubtitle: {
    color: '#888888',
    textAlign: 'center',
    marginBottom: 8,
  },
});
