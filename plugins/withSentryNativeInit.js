/**
 * withSentryNativeInit — Expo config plugin that arms the Sentry NATIVE SDK at
 * process start on BOTH platforms, BEFORE React Native / the JS bundle evaluates.
 *
 * WHY: @sentry/react-native normally initializes the native SDK from JS
 * (Sentry.init in src/app/_layout.tsx). That runs only after the JS bundle is
 * evaluated — far too late to catch a native/watchdog/ANR crash in the pre-JS
 * launch window (e.g. the first launch right after an app update, the exact
 * window that produced Pamela's invisible crash). Starting Sentry natively here
 * closes that blind spot. The JS Sentry.init then passes
 * `autoInitializeNativeSdk: false` so it reuses THIS already-running client.
 *
 * WHY A PLUGIN (not a hand-edit): ios/ and android/ are git-ignored CNG output —
 * a clean `expo prebuild` regenerates them and wipes hand-edits. This plugin
 * re-applies the native init on every prebuild, on both platforms, durably.
 *
 * The DSN is public (it ships inside the app binary anyway); same value as
 * EXPO_PUBLIC_SENTRY_DSN. Mobile Session Replay is configured natively here
 * because, with autoInitializeNativeSdk:false, JS no longer configures it.
 * Masking is forced ON so replays never leak text/images.
 *
 * Both injections are IDEMPOTENT (they no-op if the init is already present), so
 * a non-clean prebuild over already-patched files won't double-inject.
 */
const { withAppDelegate, withMainApplication } = require('expo/config-plugins');

const DSN =
  'https://8c274f13e3bc7ee5128a14ef55366340@o4510961982373888.ingest.us.sentry.io/4510961983815680';

// ----------------------------- iOS (AppDelegate.swift) -----------------------------
const IOS_BLOCK = `    // SENTRY_NATIVE_INIT (withSentryNativeInit plugin) — arm Sentry before
    // PushKit / React Native so pre-JS launch-window crashes are captured.
    SentrySDK.start { options in
      options.dsn = "${DSN}"
#if DEBUG
      options.environment = "development"
#else
      options.environment = "production"
#endif
      options.enableWatchdogTerminationTracking = true
      options.enableAppHangTrackingV2 = true
      options.appHangTimeoutInterval = 2.0
      options.sessionReplay.sessionSampleRate = 1.0
      options.sessionReplay.onErrorSampleRate = 1.0
      options.sessionReplay.maskAllText = true
      options.sessionReplay.maskAllImages = true
      // Parity with the old JS maskAllVectors:true — mask react-native-svg too.
      if let svg = NSClassFromString("RNSVGSvgView") {
        options.sessionReplay.maskedViewClasses = [svg]
      }
    }
`;

function withIosSentryNativeInit(config) {
  return withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== 'swift') {
      throw new Error('[withSentryNativeInit] Expected a Swift AppDelegate.');
    }
    let src = cfg.modResults.contents;

    // Idempotent: skip if a native Sentry start already exists (hand-edit or prior run).
    if (src.includes('SentrySDK.start')) return cfg;

    // 1) import Sentry (prepend; valid anywhere at file top in Swift).
    if (!/^\s*import Sentry\s*$/m.test(src)) {
      src = `import Sentry\n${src}`;
    }

    // 2) Insert the start block at the very top of didFinishLaunchingWithOptions.
    const anchor = /(didFinishLaunchingWithOptions[\s\S]*?\)\s*->\s*Bool\s*\{\n)/;
    if (!anchor.test(src)) {
      throw new Error(
        '[withSentryNativeInit] Could not find didFinishLaunchingWithOptions in AppDelegate.swift'
      );
    }
    src = src.replace(anchor, `$1${IOS_BLOCK}`);

    cfg.modResults.contents = src;
    return cfg;
  });
}

// --------------------------- Android (MainApplication.kt) ---------------------------
// Fully-qualified name avoids an import injection. getSessionReplay()/explicit
// setters mirror exactly how RNSentryModuleImpl.java (sentry-android 8.31) does it.
const ANDROID_BLOCK = `    // SENTRY_NATIVE_INIT (withSentryNativeInit plugin) — arm Sentry before
    // React Native so pre-JS launch-window crashes / ANRs are captured.
    io.sentry.android.core.SentryAndroid.init(this) { options ->
      options.setDsn("${DSN}")
      options.setEnvironment(if (BuildConfig.DEBUG) "development" else "production")
      options.setAnrEnabled(true)
      val replay = options.getSessionReplay()
      replay.setOnErrorSampleRate(1.0)
      replay.setSessionSampleRate(1.0)
      replay.setMaskAllText(true)
      replay.setMaskAllImages(true)
      // Parity with the old JS maskAllVectors:true — mask react-native-svg too.
      replay.addMaskViewClass("com.horcrux.svg.SvgView")
    }
`;

function withAndroidSentryNativeInit(config) {
  return withMainApplication(config, (cfg) => {
    if (cfg.modResults.language !== 'kt') {
      throw new Error('[withSentryNativeInit] Expected a Kotlin MainApplication.');
    }
    let src = cfg.modResults.contents;

    // Idempotent: skip if already initialized (hand-edit or prior run).
    if (src.includes('SentryAndroid.init')) return cfg;

    // Insert right after super.onCreate() inside onCreate, before loadReactNative.
    const anchor = /(override fun onCreate\(\)\s*\{\n\s*super\.onCreate\(\)\n)/;
    if (!anchor.test(src)) {
      throw new Error(
        '[withSentryNativeInit] Could not find onCreate()/super.onCreate() in MainApplication.kt'
      );
    }
    src = src.replace(anchor, `$1${ANDROID_BLOCK}`);

    cfg.modResults.contents = src;
    return cfg;
  });
}

module.exports = function withSentryNativeInit(config) {
  config = withIosSentryNativeInit(config);
  config = withAndroidSentryNativeInit(config);
  return config;
};
