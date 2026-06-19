import { Redirect } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuthStore } from '@/stores/authStore';
import { useSignupStore } from '@/stores/signupStore';
import { COLORS } from '@/constants/theme';

export default function Index() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const signupHasHydrated = useSignupStore((s) => s.hasHydrated);
  const signupSessionId = useSignupStore((s) => s.sessionId);

  // Wait for both stores to hydrate before deciding where to send the user.
  // Skipping this can flash "welcome" on cold start before the persisted
  // signup session loads from MMKV.
  if (isLoading || !signupHasHydrated) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  // An in-progress signup session always wins — resume the wizard so the
  // user doesn't lose progress. The wizard itself re-syncs with the server
  // and places the user on the right step.
  if (signupSessionId) {
    return <Redirect href="/(auth)/register" />;
  }

  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(auth)/welcome" />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background.primary,
  },
});
