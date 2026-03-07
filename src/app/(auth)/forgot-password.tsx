import { useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { OtpInput } from '@/components/ui/OtpInput';
import { authService } from '@/lib/api/authService';
import { isValidEmail, isStrongPassword } from '@/utils/validators';

type Step = 'email' | 'reset';

export default function ForgotPasswordScreen() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [otpError, setOtpError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  const handleSendOtp = useCallback(async () => {
    setEmailError('');
    setApiError('');

    if (!isValidEmail(email.trim())) {
      setEmailError('Enter a valid email address');
      return;
    }

    try {
      setIsLoading(true);
      await authService.forgotPassword({ email: email.trim().toLowerCase() });
    } catch {
      // Always advance to prevent email enumeration
    } finally {
      setIsLoading(false);
      setStep('reset');
    }
  }, [email]);

  const handleReset = useCallback(async () => {
    setOtpError('');
    setPasswordError('');
    setConfirmError('');
    setApiError('');

    let hasError = false;
    if (otp.length !== 6) {
      setOtpError('Enter the 6-digit code');
      hasError = true;
    }
    if (!isStrongPassword(password)) {
      setPasswordError(
        'Password must be 8+ chars with uppercase, lowercase, and a number'
      );
      hasError = true;
    }
    if (password !== confirmPassword) {
      setConfirmError('Passwords do not match');
      hasError = true;
    }
    if (hasError) return;

    try {
      setIsLoading(true);
      await authService.resetPassword({
        email: email.trim().toLowerCase(),
        otp,
        password,
      });
      router.replace('/(auth)/login');
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : 'Reset failed. Please try again.';
      setApiError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [email, otp, password, confirmPassword]);

  if (step === 'email') {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAwareScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          bottomOffset={16}
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <Text variant="h2" style={styles.title}>
            Reset your password
          </Text>
          <Text variant="body" style={styles.subtitle}>
            Enter your account email. We will send a verification code to your registered
            phone.
          </Text>

          {apiError ? (
            <Text variant="small" style={styles.apiError}>
              {apiError}
            </Text>
          ) : null}

          <Input
            label="Email"
            value={email}
            onChangeText={(v: string) => {
              setEmail(v);
              setEmailError('');
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            error={emailError}
          />

          <Button
            title="Send Code"
            onPress={handleSendOtp}
            loading={isLoading}
            disabled={isLoading}
          />
        </KeyboardAwareScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        bottomOffset={16}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity onPress={() => setStep('email')} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <Text variant="h2" style={styles.title}>
          Enter the code
        </Text>
        <Text variant="body" style={styles.subtitle}>
          Check your phone for the 6-digit code, then create a new password.
        </Text>

        {apiError ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={20} color="#EF4444" />
            <Text variant="small" style={styles.errorBannerText}>
              {apiError}
            </Text>
          </View>
        ) : null}

        <OtpInput
          length={6}
          value={otp}
          onChange={(v: string) => {
            setOtp(v);
            setOtpError('');
          }}
          error={otpError || undefined}
        />

        <View>
          <Input
            label="New Password"
            value={password}
            onChangeText={(v: string) => {
              setPassword(v);
              setPasswordError('');
            }}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            error={passwordError}
          />
          <TouchableOpacity
            style={styles.eyeToggle}
            onPress={() => setShowPassword((v) => !v)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color="#888888" />
          </TouchableOpacity>
        </View>

        <Input
          label="Confirm New Password"
          value={confirmPassword}
          onChangeText={(v: string) => {
            setConfirmPassword(v);
            setConfirmError('');
          }}
          secureTextEntry
          autoCapitalize="none"
          error={confirmError}
        />

        <Button
          title="Reset Password"
          onPress={handleReset}
          loading={isLoading}
          disabled={isLoading}
        />
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
    paddingTop: 48,
    gap: 16,
  },
  backButton: {
    marginBottom: 16,
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  title: {
    color: '#FFFFFF',
  },
  subtitle: {
    color: '#888888',
    marginBottom: 8,
  },
  apiError: {
    color: '#EF4444',
    textAlign: 'center',
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
  },
  errorBannerText: {
    color: '#EF4444',
    flex: 1,
  },
  eyeToggle: {
    position: 'absolute',
    right: 16,
    bottom: 14,
  },
});
