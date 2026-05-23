import { Image, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { Button } from '@/components/ui/Button';
import { haptic } from '@/lib/haptics/hapticService';

/**
 * Welcome screen.
 *
 * Visual port of attosound.com's hero (atto-web/src/components/sections/hero.tsx):
 *   - Base background #100e10 (near-black with a faint magenta cast).
 *   - Spotlight: radial gradient from above, simulating a stage key light
 *     beaming down onto the logo.
 *   - Vignette: radial gradient anchored at 42% from the top (where the
 *     logo sits), darkening the edges to give the matte surface depth.
 *   - Logo: 3D pre-rendered PNG of the equalizer badge (assets/logo-3d.png).
 *
 * expo-linear-gradient does not do radial, so the two backdrop layers are
 * SVG <RadialGradient> + <Rect> stacked under the content via
 * StyleSheet.absoluteFillObject. react-native-svg is already a dep.
 *
 * Sign-in / Create-account buttons keep the previous behaviour (haptic +
 * router.push); only the visual treatment changed.
 */
export default function WelcomeScreen() {
  const { t } = useTranslation('auth');

  return (
    <View style={styles.container}>
      {/* Backdrop: solid base + two radial gradients absolutely positioned
          underneath the content. */}
      <Svg
        style={StyleSheet.absoluteFillObject}
        width="100%"
        height="100%"
        pointerEvents="none"
      >
        <Defs>
          {/* Spotlight — born above the viewport, dies around 60% radius */}
          <RadialGradient
            id="spotlight"
            cx="50%"
            cy="-10%"
            rx="90%"
            ry="70%"
            fx="50%"
            fy="-10%"
          >
            <Stop offset="0%" stopColor="#ffffff" stopOpacity={0.18} />
            <Stop offset="35%" stopColor="#ffffff" stopOpacity={0.06} />
            <Stop offset="60%" stopColor="#ffffff" stopOpacity={0} />
          </RadialGradient>
          {/* Vignette — transparent until 60%, then falls to 40% black */}
          <RadialGradient
            id="vignette"
            cx="50%"
            cy="42%"
            rx="120%"
            ry="120%"
            fx="50%"
            fy="42%"
          >
            <Stop offset="60%" stopColor="#000000" stopOpacity={0} />
            <Stop offset="100%" stopColor="#000000" stopOpacity={0.4} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#spotlight)" />
        <Rect width="100%" height="100%" fill="url(#vignette)" />
      </Svg>

      <SafeAreaView style={styles.safe}>
        <View style={styles.logoSection}>
          {/* logo-3d.png is the same asset shipped with atto-web's hero.
              It's 6.5 MB so it lifts the iOS bundle; downsize once design
              is settled (the on-screen draw is 320 px, source could be
              1200×1200). */}
          <Image
            source={require('../../../assets/logo-3d.png')}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="ATTO Sound"
          />
        </View>

        <View style={styles.buttons}>
          <Button
            title={t('login.signIn')}
            onPress={() => {
              haptic('light');
              router.push('/(auth)/login');
            }}
          />
          <Button
            title={t('login.createAccount')}
            variant="outline"
            onPress={() => {
              haptic('light');
              router.push('/(auth)/register');
            }}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#100e10',
  },
  safe: {
    flex: 1,
  },
  logoSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 20,
  },
  logo: {
    // Roughly matches atto-web's `w-88 sm:w-[28rem]` (352–448 px) — picked
    // 320 here so the badge has breathing room on a 375 px iPhone width.
    width: 320,
    height: 320,
  },
  buttons: {
    paddingHorizontal: 24,
    paddingBottom: 100,
    gap: 24,
  },
});
