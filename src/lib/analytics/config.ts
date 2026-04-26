/**
 * PostHog configuration — centralised so every consumer references one source of truth.
 */

const IS_DEV = __DEV__;

export const POSTHOG_CONFIG = {
  apiKey: process.env.EXPO_PUBLIC_POSTHOG_API_KEY!,
  host: process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',

  disabled: false,

  autocapture: {
    captureTouches: true,
    captureScreens: false,
    ignoreLabels: ['ph-no-capture'],
  },

  captureAppLifecycleEvents: true,

  /** Beta phase: create profiles for anonymous sessions too, so failed
   *  registrations (no identify) still get a Person we can search by. */
  personProfiles: 'always' as const,

  enableSessionReplay: true,
  sessionReplayConfig: {
    /** Sensitive inputs are masked individually:
     *  - OTP/Phone/Chat: <PostHogMaskView> wrapping
     *  - Passwords: secureTextEntry auto-masked by PostHog
     *  - Stripe card: native Payment Sheet, not capturable */
    maskAllTextInputs: false,
    maskAllImages: false,
    maskAllSandboxedViews: false,
    captureLog: true,
    captureNetworkTelemetry: true,
    throttleDelayMs: 250,
    sampleRate: 1.0,
  },

  /** Feature flags: 5s timeout to avoid blocking on slow networks */
  featureFlagsRequestTimeoutMs: 5_000,

  /** Flush thresholds */
  flushAt: 20,
  flushInterval: 10_000,
};
