import { useEffect, useRef } from 'react';
import { Stack, router, useSegments, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';

export default function AuthLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const segments = useSegments();
  const params = useLocalSearchParams<{ mode?: string }>();
  // Once the wizard is mounted, the wizard owns the redirect to /(tabs) so
  // we don't kick the user out mid-subscription step.
  const wasInRegister = useRef(false);

  useEffect(() => {
    if (segments.some((s) => s === 'register')) {
      wasInRegister.current = true;
    }
  }, [segments]);

  useEffect(() => {
    if (wasInRegister.current) return;
    // Adding a second account from login — don't bounce the user.
    if (params.mode === 'add' || params.mode === 'creator') return;
    if (!isLoading && isAuthenticated) {
      router.replace('/(tabs)');
    }
  }, [isLoading, isAuthenticated, params.mode]);

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
