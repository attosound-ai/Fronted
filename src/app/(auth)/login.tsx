import { useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Keyboard } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Link, router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Logo } from '@/components/ui/Logo';
import { OtpInput } from '@/components/ui/OtpInput';
import { useAuthStore } from '@/stores/authStore';

export default function LoginScreen() {
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

  const handleLogin = useCallback(async () => {
    setIdentifierError('');
    setPasswordError('');
    clearError();

    if (!identifier.trim()) {
      setIdentifierError('Enter your phone, email, or username');
      return;
    }
    if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }

    try {
      await login({ identifier: identifier.trim(), password });
      // If pending2FA is set, login() returned early — don't navigate
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

  const handleBack2FA = useCallback(() => {
    setOtpCode('');
    clearPending2FA();
  }, [clearPending2FA]);

  if (pending2FA) {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAwareScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          bottomOffset={16}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Ionicons name="shield-checkmark" size={64} color="#3B82F6" />
          </View>

          <View style={styles.form}>
            <Text variant="h2" style={styles.twoFaTitle}>
              Two-Factor Authentication
            </Text>
            <Text variant="body" style={styles.twoFaSubtitle}>
              Enter the 6-digit code sent to{'\n'}
              {pending2FA.maskedTarget}
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

            <TouchableOpacity onPress={handleBack2FA} style={styles.backRow}>
              <Text variant="caption" style={styles.forgotLink}>
                Back to login
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAwareScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        bottomOffset={16}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={() => Keyboard.dismiss()}
      >
        <View style={styles.header}>
          <Logo size={140} animated />
        </View>

        <View style={styles.form}>
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
            error={identifierError}
          />

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
              error={passwordError}
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
      </KeyboardAwareScrollView>

      <View style={styles.footer}>
        <Text variant="caption" style={styles.footerText}>
          {`Don't have an account? `}
          <Link href="/(auth)/register">
            <Text variant="caption" style={styles.signUpLink}>
              Sign Up
            </Text>
          </Link>
        </Text>
      </View>
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
    paddingTop: 32,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
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
    fontFamily: 'Poppins_500Medium',
  },
  footer: {
    borderTopWidth: 0.5,
    borderTopColor: '#222222',
    paddingVertical: 16,
    alignItems: 'center',
  },
  footerText: {
    color: '#888',
    textAlign: 'center',
  },
  signUpLink: {
    color: '#FFFFFF',
    fontFamily: 'Poppins_600SemiBold',
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
  backRow: {
    alignSelf: 'center',
    marginTop: 4,
  },
});
