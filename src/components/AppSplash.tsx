import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import * as Application from 'expo-application';
import {
  getCachedSplashLogo,
  refreshAppLogoCaches,
} from '@/features/feed/hooks/useAppLogo';
import { splashBox } from '@/features/feed/utils/splashLogo';
import { getCachedSplashScale } from '@/features/feed/utils/appSettings';
import { useCallStore } from '@/stores/callStore';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';

/**
 * JS launch splash: the only place a logo appears during launch.
 *
 * The native splash is compiled into the binary and paints before any code
 * runs, so it can never follow the admin: it is plain black. This overlay
 * takes over the moment it hides and draws ONE logo: the admin logo, read
 * synchronously from the MMKV cache the feed header keeps (already version
 * targeted per build), or the bundled copy on a first ever launch or when
 * the remote image fails. The logo fades in once decoded, holds briefly and
 * the overlay fades into the app. Change the logo in the admin and both the
 * header and this splash follow on the next launch.
 *
 * A VoIP push can cold launch straight into a call: in that case the overlay
 * never covers the call UI.
 */
const BUNDLED_WORDMARK = require('../../assets/splash-wordmark.png');
const HOLD_MS = 650;
const FADE_MS = 350;
/** The bundled fallback is the round mark from the website (square canvas). */
const BUNDLED_ASPECT = 1;
const LOGO_IN_MS = 180;
/** Longest the splash waits for its image before moving on without it. */
const MAX_LOGO_WAIT_MS = 1200;

export function AppSplash({ onDone }: { onDone: () => void }) {
  const { width } = useWindowDimensions();
  const [cachedLogo] = useState(() => getCachedSplashLogo());
  const uri = cachedLogo?.uri ?? null;
  // The admin logo failed to load (offline, deleted upstream): fall back to
  // the bundled one instead of holding a black screen.
  const [remoteFailed, setRemoteFailed] = useState(false);
  const opacity = useSharedValue(1);
  const logoOpacity = useSharedValue(0);

  useEffect(() => {
    // Pick up an admin change for the NEXT launch; this one already painted.
    void refreshAppLogoCaches();
    if (useCallStore.getState().activeCall) {
      onDone();
      return;
    }
    analytics.capture(ANALYTICS_EVENTS.RUNTIME.SPLASH_SHOWN, {
      source: uri ? 'cached' : 'bundled',
      // Which image and shape the splash chose, so a wrong logo on launch can
      // be read from telemetry instead of asking for a screen recording.
      aspect: cachedLogo ? Number(cachedLogo.aspect.toFixed(3)) : null,
      image: uri ? (uri.split('/').pop()?.split('?')[0] ?? null) : 'bundled',
      build: Application.nativeBuildVersion ?? null,
    });
    // The hold starts when the logo is actually on screen (see `reveal`), so a
    // slow image can never make the splash a bare black flash. If the image
    // never reports in, leave after a bounded wait.
    const failsafe = setTimeout(onDone, MAX_LOGO_WAIT_MS + HOLD_MS + FADE_MS + 500);
    return () => clearTimeout(failsafe);
    // Mount once: the splash is a launch artifact, never re run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const logoFade = useAnimatedStyle(() => ({ opacity: logoOpacity.value }));
  const revealed = useRef(false);
  const reveal = () => {
    if (revealed.current) return;
    revealed.current = true;
    logoOpacity.value = withTiming(1, { duration: LOGO_IN_MS });
    opacity.value = withDelay(
      LOGO_IN_MS + HOLD_MS,
      withTiming(0, { duration: FADE_MS }, (finished) => {
        if (finished) runOnJS(onDone)();
      })
    );
  };
  // An image that never loads must not hold the app behind a black screen.
  useEffect(() => {
    const giveUp = setTimeout(reveal, MAX_LOGO_WAIT_MS);
    return () => clearTimeout(giveUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ONE logo, ever. The native splash is plain black (it paints before any
  // code runs, so it can never follow the admin), and this overlay draws
  // either the admin logo or the bundled fallback, never both. They used to
  // be stacked, and as soon as the admin logo had a different shape the two
  // showed through each other (Sep 20 2026). The bundled file is a copy of
  // the admin logo with the same canvas, so both land in the same place.
  const showRemote = !!uri && !remoteFailed;
  // The box follows the image's own shape: a wide wordmark spans most of the
  // width, a round or square mark gets a compact box, so neither ends up tiny
  // or oversized. The bundled fallback is the round mark from the website.
  const aspect = showRemote ? (cachedLogo?.aspect ?? BUNDLED_ASPECT) : BUNDLED_ASPECT;
  // The admin sets the mark's share of the width; cached with the logo.
  const size = splashBox(aspect, width, getCachedSplashScale());
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.root, fade]}
    >
      <Animated.View style={[size, logoFade]}>
        {showRemote ? (
          <Image
            source={{ uri: uri as string }}
            style={size}
            resizeMode="contain"
            onLoad={reveal}
            onError={() => setRemoteFailed(true)}
          />
        ) : (
          <Image
            source={BUNDLED_WORDMARK}
            style={size}
            resizeMode="contain"
            onLoad={reveal}
          />
        )}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    elevation: 1000,
  },
});
