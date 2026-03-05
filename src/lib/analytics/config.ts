/**
 * PostHog configuration — centralised so every consumer references one source of truth.
 */

export const POSTHOG_CONFIG = {
  apiKey: process.env.EXPO_PUBLIC_POSTHOG_API_KEY!,
  host: process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',

  /** Autocapture: touches, lifecycle, screen views */
  autocapture: {
    captureTouches: true,
    captureLifecycleEvents: true,
    captureScreens: true,
    ignoreLabels: ['ph-no-capture'],
  },

  /** Session Replay */
  enableSessionReplay: true,
  sessionReplayConfig: {
    maskAllTextInputs: true,
    maskAllImages: false,
    maskAllSandboxedViews: true,
    androidDebouncerDelayMs: 500,
    iOSdebouncerDelayMs: 500,
  },

  /** Flush thresholds */
  flushAt: 20,
  flushInterval: 30_000,
};
