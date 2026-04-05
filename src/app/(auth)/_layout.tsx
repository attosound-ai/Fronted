import { useEffect, useRef } from 'react';
import { Stack, router, useSegments, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';

export default function AuthLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);
  const segments = useSegments();
  const params = useLocalSearchParams<{ mode?: string }>();
  // Track if user started registration — once in register, don't auto-redirect
  const wasInRegister = useRef(false);

  useEffect(() => {
    if (segments.some((s) => s === 'register')) {
      wasInRegister.current = true;
    }
  }, [segments]);

  useEffect(() => {
    // Don't redirect during registration — the register screen
    // manages its own navigation to /(tabs) after subscription/bridge steps
    if (wasInRegister.current) return;

    // Don't redirect when adding a second account — user is authenticated
    // but intentionally on the login screen to sign into another account
    if (params.mode === 'add' || params.mode === 'creator') return;

    if (!isLoading && isAuthenticated && user?.registrationStatus !== 'pending') {
      router.replace('/(tabs)');
    }
  }, [isLoading, isAuthenticated, user?.registrationStatus, params.mode]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        fullScreenGestureEnabled: false,
        animationDuration: 300,
      }}
    >
      <Stack.Screen
        name="welcome"
        options={{ animation: 'none', gestureEnabled: false }}
      />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" options={{ gestureEnabled: false }} />
      <Stack.Screen name="forgot-password" />
    </Stack>
  );
}
