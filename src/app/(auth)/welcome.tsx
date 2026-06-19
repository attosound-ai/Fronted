import { Image, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button';
import { COLORS } from '@/constants/theme';
import { haptic } from '@/lib/haptics/hapticService';

/**
 * Welcome screen.
 *
 * Visual port of attosound.com's hero (atto-web/src/components/sections/hero.tsx).
 * The web hero is a UNIFORM matte black `#100e10` with NO lighting effect —
 * no spotlight, no vignette — so the background blends edge to edge with no
 * visible "bar" near the top. We mirror that exactly here: a single flat
 * `COLORS.background.welcome` fill (= WELCOME_BACKGROUND = #100e10), matching
 * the website's <body>. (The rest of the app uses APP_BACKGROUND = pure black.)
 *
 * (Previous versions stacked two SVG <RadialGradient> layers to fake stage
 * lighting; the web dropped that — see atto-web hero `feat/hero-matte-no-lighting`
 * — so we dropped it too to keep app and site identical.)
 *
 * Logo: 3D pre-rendered PNG of the equalizer badge (assets/logo-3d.png).
 */
export default function WelcomeScreen() {
  const { t } = useTranslation('auth');

  return (
    <View style={styles.container}>
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
    // Negro mate plano e idéntico a la web (body bg-[#100e10]). Exclusivo de
    // Welcome — ver WELCOME_BACKGROUND en theme.ts; el resto de la app usa
    // APP_BACKGROUND (negro puro).
    flex: 1,
    backgroundColor: COLORS.background.welcome,
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
