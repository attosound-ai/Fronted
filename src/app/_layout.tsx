import '@/lib/i18n';
import '@/lib/pushNotifications'; // registers foreground notification handler
import '@/lib/textScaling'; // caps Dynamic Type globally to protect layouts
import { useEffect, useRef, useState, type ReactNode } from 'react';

// NOTE: We deliberately DO NOT import `react-native-audio-api` anywhere
// in the app at module-load time. The library installs global
// AVAudioSession observers in its iOS module's `install()` constructor
// (called as a side effect of any import from the package), and those
// observers fire on engine-configuration-change notifications which
// hit during a Twilio call setup — breaking call audio in subtle ways
// that even `AudioManager.disableSessionManagement()` couldn't fully
// neutralize in testing. Until we find a Twilio-safe alternative, all
// timeline playback uses `expo-audio` (no audible pan, but Twilio-safe).
import { useMountEffect } from '@/hooks';
import { useTranslation } from 'react-i18next';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PostHogProvider, PostHogErrorBoundary, usePostHog } from 'posthog-react-native';
import * as Sentry from '@sentry/react-native';
import * as ImagePicker from 'expo-image-picker';
import * as SplashScreen from 'expo-splash-screen';
import * as Application from 'expo-application';
import { AppState, StyleSheet } from 'react-native';
import { useFonts } from 'expo-font';

// Patched Archivo TTFs with corrected hhea/OS-2 metrics so iOS does not
// clip descenders (y, g, p, j). The original @expo-google-fonts/archivo
// build has hhea.descender=-210 while glyphs extend to -410, causing
// clipping in TextInputs and tight layouts. See assets/fonts/README.
const Archivo_400Regular = require('../../assets/fonts/Archivo_400Regular.ttf');
const Archivo_500Medium = require('../../assets/fonts/Archivo_500Medium.ttf');
const Archivo_600SemiBold = require('../../assets/fonts/Archivo_600SemiBold.ttf');
const Archivo_700Bold = require('../../assets/fonts/Archivo_700Bold.ttf');
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useAuthStore } from '@/stores/authStore';
import { useCallStore } from '@/stores/callStore';
import { useTwilioVoice } from '@/hooks/useTwilioVoice';
import { useMicrophonePermission } from '@/hooks/useMicrophonePermission';
import { startAmbientTelemetry } from '@/lib/telemetry';
import { useBadgeSync } from '@/hooks/useBadgeSync';
import { CallBanner } from '@/components/call/CallBanner';
import { InCallTopBar } from '@/components/call/InCallTopBar';
import { DtmfKeypadHost } from '@/components/call/DtmfKeypadHost';
import { CallAudioInjectionHost } from '@/components/call/CallAudioInjectionHost';
import { MixerHost } from '@/components/call/MixerHost';
import {
  probeResume,
  markAppBackgrounded,
  msSinceBackground,
} from '@/lib/telemetry/resumeProbe';
import { AccountSwitchOverlay } from '@/components/ui/AccountSwitchOverlay';
import { UpdateRequiredGate } from '@/components/UpdateRequiredScreen';
import { analytics, POSTHOG_CONFIG } from '@/lib/analytics';

// --- Sentry native-init gate — prevents the "Sentry went dark" class of bug ---
// Builds at/after this number compile the native Sentry bootstrap
// (withSentryNativeInit → AppDelegate.swift / MainApplication.kt), which arms
// Sentry BEFORE the JS bundle runs. On those builds JS must NOT re-init native
// (autoInitializeNativeSdk:false) so there is a single, pre-JS-armed client.
// On ANY older build the native bootstrap is absent, so JS MUST init native or
// Sentry goes completely dark (the build-64 incident: zero events reported).
// SAFETY: this stays unreachably high until you BUMP it to a build number you
// have VERIFIED actually ships the native init (and saw events from). Until then
// every build resolves to `true` (never dark). Unknown/NaN build → also `true`.
const FIRST_NATIVE_SENTRY_BUILD = Number.MAX_SAFE_INTEGER; // TODO: set to verified native-init build #
const SENTRY_NATIVE_PRE_ARMED =
  Number(Application.nativeBuildVersion ?? NaN) >= FIRST_NATIVE_SENTRY_BUILD;

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  // false ONLY on builds that pre-arm Sentry natively (see the gate above);
  // true everywhere else so Sentry can NEVER go dark on a build that lacks the
  // native bootstrap (the build-64 incident reported zero events).
  autoInitializeNativeSdk: !SENTRY_NATIVE_PRE_ARMED,
  tracesSampleRate: 0,
  // These drive native replay whenever JS owns init (autoInitializeNativeSdk:
  // true); masking (text + images + vectors/SVG) is set via mobileReplayIntegration.
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

let StripeProvider: (props: {
  publishableKey: string;
  merchantIdentifier?: string;
  children: ReactNode;
}) => ReactNode;
try {
  StripeProvider = require('@stripe/stripe-react-native').StripeProvider;
} catch {
  StripeProvider = ({ children }: { children: ReactNode }) => children;
}

// Tells expo-router the default route, preventing stale modal
// screens (call, recording) from being restored on reload
export const unstable_settings = {
  initialRouteName: '(auth)',
};

SplashScreen.preventAutoHideAsync();

// QueryClient is extracted to a shared module so stores can import it
// for cache invalidation (e.g., on account switch).
import { queryClient, queryPersister } from '@/lib/queryClient';
import { COLORS } from '@/constants/theme';

/** Bridges the PostHog instance into the analytics singleton + global error handler. */
function AnalyticsInitializer() {
  const posthog = usePostHog();
  // Legitimate: posthog transitions undefined → instance once after provider mounts.
  useEffect(() => {
    if (!posthog) return;
    analytics.setInstance(posthog);

    // Global unhandled-error capture (non-React JS errors — React render
    // errors are caught by PostHogErrorBoundary instead).
    const RNErrorUtils = (global as any).ErrorUtils;
    if (RNErrorUtils) {
      const defaultHandler = RNErrorUtils.getGlobalHandler();
      RNErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
        analytics.captureError(error, { is_fatal: isFatal, source: 'global_handler' });
        defaultHandler(error, isFatal);
      });
    }

    // Ambient runtime telemetry — 30 s tick of memory / battery / network /
    // JS lag / listener counts so we always have a recent snapshot when a
    // crash hits anywhere in the app, not just during a call.
    // Idempotent; auto-pauses during calls and while backgrounded.
    startAmbientTelemetry();
  }, [posthog]);
  return null;
}

/**
 * Manual screen tracking for Expo Router v3+ (React Navigation v7).
 * RN v7 restricts navigation hooks, so automatic screen capture is unreliable.
 * This component fires posthog.screen() on every pathname change.
 */
function ScreenTracker() {
  const pathname = usePathname();
  const posthog = usePostHog();
  const prevPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!posthog || !pathname) return;
    if (pathname === prevPathRef.current) return;
    const from = prevPathRef.current;
    prevPathRef.current = pathname;
    posthog.screen(pathname, { route: pathname });
    // Navigation breadcrumb so every Sentry event (incl. native crashes) shows
    // exactly where the user navigated / which tabs they hit before it.
    Sentry.addBreadcrumb({
      category: 'navigation',
      level: 'info',
      type: 'navigation',
      message: pathname,
      data: { from: from ?? '(initial)', to: pathname },
    });
  }, [pathname, posthog]);

  return null;
}

/** Minimal fallback shown when PostHogErrorBoundary catches a render crash. */
function ErrorFallback() {
  return null; // Sentry already captures — this just prevents a white screen
}

function RootLayout() {
  const { t } = useTranslation('messages');
  const initialize = useAuthStore((s) => s.initialize);
  useTwilioVoice();
  useMicrophonePermission();
  useBadgeSync();
  const [fontsLoaded] = useFonts({
    Archivo_400Regular,
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
  });
  useMountEffect(() => {
    initialize();
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  // Re-hide the splash every time the app becomes active. A VoIP push can
  // cold-launch the app directly into the BACKGROUND (iOS terminates a merely
  // backgrounded app under memory pressure, then relaunches it to handle the
  // call). The React tree mounts and the call connects, but `hideAsync()` above
  // runs while suspended and never actually removes the native splash — so the
  // user foregrounds into a black splash covering the already-rendered app
  // (Bug #2: "black screen after answering"). Re-hiding on 'active' reveals it.
  // Idempotent and cheap.
  // Deep-suspension black-screen mitigation + diagnosis. On a real
  // background→active transition (e.g. a VoIP-wake after the phone was off) iOS
  // can purge the New-Arch root drawable; the JS tree resumes but renders black
  // (build-56 telemetry: ticks + resume snapshot fire, surface stays dark).
  //   (a) re-hide the splash as before (prior Bug #2),
  //   (b) emit app_resume_probe so we can finally SEE whether the compositor
  //       came back (raf_fired) + how deep the suspension was, and
  //   (c) nudge the root with a sub-pixel transform to force Fabric to re-commit
  //       and re-acquire a drawable.
  const prevAppStateRef = useRef(AppState.currentState);
  const [resumeNudge, setResumeNudge] = useState(false);
  // Bumped on a DEEP resume to force a full remount of the content subtree. A
  // sub-pixel transform (resumeNudge) only re-commits layout — it does NOT
  // re-paint layers whose GPU backing store iOS purged during a long
  // suspension, which is why the phone-off black screen survived build 58. A
  // key change unmounts + remounts the views, so they re-acquire fresh
  // drawables. Gated to deep suspensions only (≥2min) so normal multitasking
  // is never remounted; providers/call store/Twilio call live above it and are
  // untouched.
  const [deepResumeKey, setDeepResumeKey] = useState(0);
  const DEEP_RESUME_MS = 120_000;
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = prevAppStateRef.current;
      prevAppStateRef.current = next;
      if (next !== 'active') {
        markAppBackgrounded();
        return;
      }
      SplashScreen.hideAsync().catch(() => {});
      if (prev !== 'active') {
        const deep = (msSinceBackground() ?? 0) >= DEEP_RESUME_MS;
        probeResume('app_resume_probe', {
          in_call: useCallStore.getState().activeCall != null,
          prev_state: prev,
          deep_resume: deep,
          remounted: deep,
        });
        setResumeNudge(true);
        requestAnimationFrame(() => requestAnimationFrame(() => setResumeNudge(false)));
        // Deep suspension → remount to recover from a purged drawable (black screen).
        if (deep) setDeepResumeKey((k) => k + 1);
      }
    });
    return () => sub.remove();
  }, []);

  // Invalidate project cache when a call ends (covers all end scenarios)
  useMountEffect(() => {
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
  });

  return (
    <PostHogProvider
      apiKey={POSTHOG_CONFIG.apiKey}
      options={{
        host: POSTHOG_CONFIG.host,
        disabled: POSTHOG_CONFIG.disabled,
        enableSessionReplay: POSTHOG_CONFIG.enableSessionReplay,
        sessionReplayConfig: POSTHOG_CONFIG.sessionReplayConfig,
        captureAppLifecycleEvents: POSTHOG_CONFIG.captureAppLifecycleEvents,
        personProfiles: POSTHOG_CONFIG.personProfiles,
        featureFlagsRequestTimeoutMs: POSTHOG_CONFIG.featureFlagsRequestTimeoutMs,
        flushAt: POSTHOG_CONFIG.flushAt,
        flushInterval: POSTHOG_CONFIG.flushInterval,
      }}
      autocapture={POSTHOG_CONFIG.autocapture}
    >
      <AnalyticsInitializer />
      <ScreenTracker />
      <PostHogErrorBoundary
        fallback={ErrorFallback}
        additionalProperties={{ source: 'error_boundary' }}
      >
        <StripeProvider
          publishableKey={STRIPE_PUBLISHABLE_KEY}
          merchantIdentifier="merchant.com.atto.sound"
        >
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{ persister: queryPersister, maxAge: 1000 * 60 * 60 * 24 }}
          >
            <GestureHandlerRootView
              style={[
                { flex: 1 },
                // Sub-pixel transform pulse on deep resume re-commits the Fabric
                // root so a purged drawable is re-acquired (black-screen fix).
                // Reverted after two frames; imperceptible.
                resumeNudge
                  ? { transform: [{ translateY: StyleSheet.hairlineWidth }] }
                  : null,
              ]}
            >
              <KeyboardProvider>
                <SafeAreaProvider>
                  <StatusBar style="light" />
                  {!fontsLoaded ? null : (
                    <UpdateRequiredGate key={deepResumeKey}>
                      <InCallTopBar />
                      <DtmfKeypadHost />
                      <CallAudioInjectionHost />
                      <MixerHost />
                      <Stack
                        screenOptions={{
                          headerShown: true,
                          headerBackTitle: '',
                          headerStyle: { backgroundColor: COLORS.background.primary },
                          headerTintColor: '#FFFFFF',
                          headerTitleStyle: {
                            fontFamily: 'Archivo_600SemiBold',
                            fontSize: 17,
                          },
                          headerShadowVisible: false,
                          headerBackTitleVisible: false,
                          contentStyle: { backgroundColor: COLORS.background.primary },
                          animation: 'slide_from_right',
                          fullScreenGestureEnabled: false,
                          animationDuration: 300,
                        }}
                      >
                        <Stack.Screen
                          name="index"
                          options={{
                            headerShown: false,
                            title: '',
                            gestureEnabled: false,
                          }}
                        />
                        <Stack.Screen
                          name="(auth)"
                          options={{
                            headerShown: false,
                            title: '',
                            animation: 'fade',
                            gestureEnabled: false,
                          }}
                        />
                        <Stack.Screen
                          name="(tabs)"
                          options={{
                            headerShown: false,
                            title: '',
                            headerBackTitle: '',
                            animation: 'fade',
                            gestureEnabled: false,
                            fullScreenGestureEnabled: false,
                          }}
                        />
                        <Stack.Screen
                          name="edit-creator-contact"
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
                          name="chat"
                          options={{
                            headerShown: false,
                            animation: 'slide_from_right',
                          }}
                        />
                        <Stack.Screen
                          name="new-message"
                          options={{
                            title: t('newMessage.headerTitle'),
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
                            contentStyle: { backgroundColor: COLORS.background.primary },
                          }}
                        />
                        <Stack.Screen
                          name="edit-post"
                          options={{
                            headerShown: false,
                            presentation: 'modal',
                            animation: 'slide_from_bottom',
                          }}
                        />
                        <Stack.Screen
                          name="create-post"
                          options={{
                            headerShown: false,
                            presentation: 'modal',
                            animation: 'slide_from_bottom',
                          }}
                        />
                        <Stack.Screen
                          name="post/[id]"
                          options={{
                            headerShown: false,
                            animation: 'slide_from_right',
                          }}
                        />
                        <Stack.Screen
                          name="reel/[id]"
                          options={{
                            headerShown: false,
                            // Fade so tapping a feed video reads as "expanding"
                            // into the full-screen reel viewer (Instagram-style).
                            animation: 'fade',
                            contentStyle: { backgroundColor: COLORS.background.primary },
                          }}
                        />
                        <Stack.Screen
                          name="bookmarks"
                          options={{
                            headerShown: false,
                            animation: 'slide_from_right',
                          }}
                        />
                        <Stack.Screen
                          name="following"
                          options={{
                            headerShown: false,
                            animation: 'slide_from_right',
                          }}
                        />
                        <Stack.Screen
                          name="notifications"
                          options={{
                            headerShown: false,
                            animation: 'slide_from_right',
                          }}
                        />
                        <Stack.Screen
                          name="projects"
                          options={{
                            headerShown: false,
                            animation: 'slide_from_right',
                          }}
                        />
                        <Stack.Screen name="+not-found" />
                      </Stack>
                      <CallBanner />
                      <AccountSwitchOverlay />
                    </UpdateRequiredGate>
                  )}
                </SafeAreaProvider>
              </KeyboardProvider>
            </GestureHandlerRootView>
          </PersistQueryClientProvider>
        </StripeProvider>
      </PostHogErrorBoundary>
    </PostHogProvider>
  );
}

export default Sentry.wrap(RootLayout);
