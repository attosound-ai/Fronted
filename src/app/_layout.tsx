import { useEffect, type ReactNode } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PostHogProvider, usePostHog } from 'posthog-react-native';
import * as Sentry from '@sentry/react-native';
import * as ImagePicker from 'expo-image-picker';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useAuthStore } from '@/stores/authStore';
import { useCallStore } from '@/stores/callStore';
import { useTwilioVoice } from '@/hooks/useTwilioVoice';
import { CallBanner } from '@/components/call/CallBanner';
import { InCallTopBar } from '@/components/call/InCallTopBar';
import { BugReportFAB } from '@/components/BugReportFAB';
import { analytics, POSTHOG_CONFIG } from '@/lib/analytics';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
  replaysSessionSampleRate: 1.0,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    Sentry.mobileReplayIntegration({
      maskAllText: true,
      maskAllImages: true,
      maskAllVectors: true,
    }),
    Sentry.feedbackIntegration({
      formTitle: 'Report a Bug',
      submitButtonLabel: 'Send Report',
      messageLabel: 'What happened?',
      messagePlaceholder: 'Describe the bug...',
      nameLabel: 'Name',
      namePlaceholder: 'Your name',
      emailLabel: 'Email',
      emailPlaceholder: 'your@email.com',
      successMessageText: 'Thanks! Bug report sent.',
      enableScreenshot: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- expo-image-picker types slightly incompatible with Sentry's ImagePicker interface (fileName: null vs undefined)
      imagePicker: ImagePicker as any,
      showBranding: false,
      colorScheme: 'dark',
      themeDark: {
        background: '#111111',
        foreground: '#FFFFFF',
        accentBackground: '#3B82F6',
        accentForeground: '#FFFFFF',
        border: '#222222',
      },
    }),
  ],
});

const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

let StripeProvider: (props: { publishableKey: string; children: ReactNode }) => ReactNode;
try {
  StripeProvider = require('@stripe/stripe-react-native').StripeProvider;
} catch {
  StripeProvider = ({ children }: { children: ReactNode }) => children;
}

// Tells expo-router the default route, preventing stale modal
// screens (call, recording) from being restored on reload
export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 2,
    },
  },
});

/** Bridges the PostHog instance into the analytics singleton + global error handler. */
function AnalyticsInitializer() {
  const posthog = usePostHog();
  useEffect(() => {
    if (!posthog) return;
    analytics.setInstance(posthog);

    // Global unhandled-error capture
    const RNErrorUtils = (global as any).ErrorUtils;
    if (RNErrorUtils) {
      const defaultHandler = RNErrorUtils.getGlobalHandler();
      RNErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
        analytics.captureError(error, { is_fatal: isFatal });
        defaultHandler(error, isFatal);
      });
    }
  }, [posthog]);
  return null;
}

function RootLayout() {
  const initialize = useAuthStore((s) => s.initialize);
  useTwilioVoice();
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });
  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  // Invalidate project cache when a call ends (covers all end scenarios)
  useEffect(() => {
    let trackedProjectId: string | null = null;

    const unsubscribe = useCallStore.subscribe((state, prevState) => {
      if (state.activeProjectId) {
        trackedProjectId = state.activeProjectId;
      }
      if (prevState.activeCall && !state.activeCall && trackedProjectId) {
        queryClient.invalidateQueries({ queryKey: ['project', trackedProjectId] });
        queryClient.invalidateQueries({ queryKey: ['projects'] });
        trackedProjectId = null;
      }
    });

    return unsubscribe;
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <PostHogProvider
      apiKey={POSTHOG_CONFIG.apiKey}
      options={{
        host: POSTHOG_CONFIG.host,
        enableSessionReplay: POSTHOG_CONFIG.enableSessionReplay,
        sessionReplayConfig: POSTHOG_CONFIG.sessionReplayConfig,
        flushAt: POSTHOG_CONFIG.flushAt,
        flushInterval: POSTHOG_CONFIG.flushInterval,
      }}
      autocapture={POSTHOG_CONFIG.autocapture}
    >
      <AnalyticsInitializer />
      <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY}>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <SafeAreaProvider>
                <StatusBar style="light" />
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: '#000000' },
                    animation: 'slide_from_right',
                  }}
                >
                  <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  <Stack.Screen
                    name="edit-artist-contact"
                    options={{
                      headerShown: false,
                      presentation: 'modal',
                      animation: 'slide_from_bottom',
                    }}
                  />
                  <Stack.Screen
                    name="edit-profile"
                    options={{
                      headerShown: false,
                      presentation: 'modal',
                      animation: 'slide_from_bottom',
                    }}
                  />
                  <Stack.Screen
                    name="call"
                    options={{
                      headerShown: false,
                      presentation: 'fullScreenModal',
                      animation: 'slide_from_bottom',
                      gestureEnabled: false,
                    }}
                  />
                  <Stack.Screen
                    name="recording"
                    options={{
                      headerShown: false,
                      presentation: 'fullScreenModal',
                      animation: 'slide_from_bottom',
                      gestureEnabled: false,
                    }}
                  />
                  <Stack.Screen
                    name="chat"
                    options={{
                      headerShown: false,
                      animation: 'slide_from_right',
                    }}
                  />
                  <Stack.Screen
                    name="new-message"
                    options={{
                      headerShown: false,
                      presentation: 'modal',
                      animation: 'slide_from_bottom',
                    }}
                  />
                  <Stack.Screen
                    name="project/[id]"
                    options={{
                      headerShown: false,
                      animation: 'slide_from_right',
                    }}
                  />
                  <Stack.Screen
                    name="user/[id]"
                    options={{
                      headerShown: false,
                      animation: 'slide_from_right',
                    }}
                  />
                  <Stack.Screen
                    name="subscription"
                    options={{
                      headerShown: false,
                      presentation: 'modal',
                      animation: 'slide_from_bottom',
                    }}
                  />
                  <Stack.Screen name="+not-found" />
                </Stack>
                <InCallTopBar />
                <CallBanner />
                <BugReportFAB />
              </SafeAreaProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </StripeProvider>
    </PostHogProvider>
  );
}

export default Sentry.wrap(RootLayout);
