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
    // Mask all by default. The screenshot pipeline allocates a second
    // full-size CGContext per snapshot when masking happens, so masking
    // ON globally is paradoxically RAM-cheaper than OFF on screens that
    // do contain masked widgets — the early-out path added in
    // posthog-ios PR #532 only fires when there are no masks at all.
    // Use <PostHogMaskView mask={false}> to opt screens back in if a
    // specific replay needs unmasked imagery.
    maskAllImages: true,
    maskAllSandboxedViews: true,
    // captureLog adds an OSLog/stdout tap that bloats replay payloads
    // on a video-heavy app. Sentry breadcrumbs cover the same need.
    captureLog: false,
    captureNetworkTelemetry: true,
    // sampleRate=1.0 keeps EVERY session recorded (product requirement).
    // RAM is bounded primarily by being on posthog-ios >= 3.49.0 (PR #532)
    // which fixes an autoreleasepool leak in the screenshot pipeline at
    // throttle <= 1s. Make sure Podfile.lock shows PostHog (3.57.1+).
    throttleDelayMs: 1000,
    sampleRate: 1.0,
  },

  /** Feature flags: 5s timeout to avoid blocking on slow networks */
  featureFlagsRequestTimeoutMs: 5_000,

  /** Flush thresholds — kept aggressive so analytics events drain
   *  to the network quickly. Replay snapshots flush via their own
   *  PostHogFileBackedQueue independently of these. */
  flushAt: 10,
  flushInterval: 5_000,
};
