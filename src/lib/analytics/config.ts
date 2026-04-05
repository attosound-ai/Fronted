/**
 * PostHog configuration — centralised so every consumer references one source of truth.
 */

const IS_DEV = __DEV__;

export const POSTHOG_CONFIG = {
  apiKey: process.env.EXPO_PUBLIC_POSTHOG_API_KEY!,
  host: process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',

  /** Disable in development to avoid contaminating production data.
   *  Set to false temporarily for telemetry testing. */
  disabled: IS_DEV,

  /** Autocapture: touches, screen views */
  autocapture: {
    captureTouches: true,
    captureScreens: false, // manual tracking via ScreenTracker (Expo Router v3+ / RN v7)
    ignoreLabels: ['ph-no-capture'],
  },

  /** Lifecycle events (Application Installed/Opened/Updated/Backgrounded) */
  captureAppLifecycleEvents: true,

  /** Person profiles only created after identify() */
  personProfiles: 'identified_only' as const,

  /** Session Replay */
  enableSessionReplay: true,
  sessionReplayConfig: {
    maskAllTextInputs: true,
    maskAllImages: true,
    maskAllSandboxedViews: true,
    captureLog: true,
    captureNetworkTelemetry: true,
    throttleDelayMs: 500,
    sampleRate: 0.5,
  },

  /** Feature flags: 5s timeout to avoid blocking on slow networks */
  featureFlagsRequestTimeoutMs: 5_000,

  /** Flush thresholds */
  flushAt: 20,
  flushInterval: 10_000,
};
