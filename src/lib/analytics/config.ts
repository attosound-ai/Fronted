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
    /** Policy: record EVERYTHING except passwords/credentials.
     *  Passwords never leak — the native iOS SDK masks any input where
     *  isSecureTextEntry is true OR textContentType is in its sensibleTypes
     *  list (password/newPassword, plus emailAddress, username, oneTimeCode,
     *  name, address, …). So login/registration credential fields and the
     *  OTP code stay masked even though everything else below is unmasked.
     *  Stripe card entry is a native Payment Sheet (out-of-process), so it
     *  is never capturable regardless. */
    maskAllTextInputs: false,
    // Record images/avatars/feed/video (was true — replays came out mostly
    // blacked out). Trade-off: unmasked snapshots are larger, so replay
    // upload/storage grows on this media-heavy app. RAM is unaffected:
    // media-only screens now hit the posthog-ios PR #532 early-out (no
    // masks → no extra CGContext); the expensive masking pass only runs on
    // screens that still carry a mask (the credential fields above).
    maskAllImages: false,
    maskAllSandboxedViews: false,
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
