import { useState, useCallback, useRef, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Keyboard, Animated } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { OtpInput } from '@/components/ui/OtpInput';
import { useAuthStore } from '@/stores/authStore';

type Step = 'identifier' | 'password' | '2fa';

export default function LoginScreen() {
  const [step, setStep] = useState<Step>('identifier');
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [identifierError, setIdentifierError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otpCode, setOtpCode] = useState('');

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

  const animateTransition = useCallback(
    (dir: 'forward' | 'back') => {
      const startY = dir === 'forward' ? 30 : -20;
      opacity.setValue(0);
      translateY.setValue(startY);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    },
    [opacity, translateY]
  );

  const goTo = useCallback((nextStep: Step, dir: 'forward' | 'back') => {
    setDirection(dir);
    setStep(nextStep);
  }, []);

  useEffect(() => {
    animateTransition(direction);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // Transition to 2FA step when pending2FA is set
  useEffect(() => {
    if (pending2FA && step === 'password') {
      goTo('2fa', 'forward');
    }
  }, [pending2FA, step, goTo]);

  const handleContinue = useCallback(() => {
    setIdentifierError('');
    clearError();
    if (!identifier.trim()) {
      setIdentifierError('Enter your phone, email, or username');
      return;
    }
    Keyboard.dismiss();
    goTo('password', 'forward');
  }, [identifier, clearError, goTo]);

  const handleLogin = useCallback(async () => {
    setPasswordError('');
    clearError();
    if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }
    try {
      await login({ identifier: identifier.trim(), password });
      if (!useAuthStore.getState().pending2FA) {
        router.replace('/(tabs)');
      }
    } catch {
      // error displayed via authStore.error
    }
  }, [identifier, password, login, clearError]);

  const handleVerify2FA = useCallback(async () => {
    if (otpCode.length !== 6) return;
    clearError();
    try {
      await verify2FALogin(otpCode);
      router.replace('/(tabs)');
    } catch {
      // error displayed via authStore.error
    }
  }, [otpCode, verify2FALogin, clearError]);

  const handleBack = useCallback(() => {
    clearError();
    if (step === 'identifier') {
      router.back();
    } else if (step === 'password') {
      setPasswordError('');
      goTo('identifier', 'back');
    } else if (step === '2fa') {
      setOtpCode('');
      clearPending2FA();
      goTo('password', 'back');
    }
  }, [step, clearError, clearPending2FA, goTo]);

  const renderStep = () => {
    switch (step) {
      case 'identifier':
        return (
          <View style={styles.form}>
            <Text variant="h1" style={styles.title}>
              {"What's your email, phone, or username?"}
            </Text>

            {authError && (
              <Text variant="small" style={styles.apiError}>
                {authError}
              </Text>
            )}

            <Input
              placeholder="Phone number, email, username"
              value={identifier}
              onChangeText={(v: string) => {
                setIdentifier(v);
                setIdentifierError('');
                clearError();
              }}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              autoFocus
              error={identifierError}
              onSubmitEditing={handleContinue}
              returnKeyType="next"
            />

            <Button
              title="Continue"
              onPress={handleContinue}
              disabled={!identifier.trim()}
            />
          </View>
        );

      case 'password':
        return (
          <View style={styles.form}>
            <Text variant="h1" style={styles.title}>
              Enter your password
            </Text>
            <Text variant="caption" style={styles.subtitle}>
              {identifier}
            </Text>

            {authError && (
              <Text variant="small" style={styles.apiError}>
                {authError}
              </Text>
            )}

            <View>
              <Input
                placeholder="Password"
                value={password}
                onChangeText={(v: string) => {
                  setPassword(v);
                  setPasswordError('');
                  clearError();
                }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="password"
                autoFocus
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
              title="Sign In"
              onPress={handleLogin}
              loading={isAuthenticating}
              disabled={isAuthenticating}
            />

            <TouchableOpacity
              onPress={() => router.push('/(auth)/forgot-password')}
              style={styles.forgotRow}
            >
              <Text variant="caption" style={styles.forgotLink}>
                Forgot password?
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
              Two-Factor Authentication
            </Text>
            <Text variant="body" style={styles.twoFaSubtitle}>
              Enter the 6-digit code sent to{'\n'}
              {pending2FA?.maskedTarget}
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
              title="Verify"
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
      <TouchableOpacity
        style={styles.backButton}
        onPress={handleBack}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      <KeyboardAwareScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        bottomOffset={16}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={[styles.stepContainer, { opacity, transform: [{ translateY }] }]}
        >
          {renderStep()}
        </Animated.View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 80,
  },
  stepContainer: {
    flex: 1,
  },
  backButton: {
    position: 'absolute',
    top: 56,
    left: 16,
    zIndex: 10,
    padding: 4,
  },
  form: {
    gap: 16,
  },
  title: {
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    color: '#888888',
    marginTop: -8,
    marginBottom: 8,
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
    fontFamily: 'Poppins_500Medium',
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
