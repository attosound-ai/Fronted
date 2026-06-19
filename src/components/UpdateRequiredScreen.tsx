import { useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { isClientOutdated, onClientOutdated } from '@/lib/api/client';
import { COLORS } from '@/constants/theme';

// App Store / Play Store links. Replace with the actual IDs once published;
// the defaults open the store search as a soft fallback.
const APP_STORE_URL =
  process.env.EXPO_PUBLIC_APP_STORE_URL ?? 'itms-apps://apps.apple.com/app/atto-sound';
const PLAY_STORE_URL =
  process.env.EXPO_PUBLIC_PLAY_STORE_URL ?? 'market://details?id=com.attosound.app';

/**
 * Renders a full-screen "Update required" prompt when the backend has
 * returned 426 Upgrade Required on any request. The whole tree is gated on
 * `isClientOutdated()` so once we know the binary is stale we never paint
 * the rest of the app — it would just hit more 426s and confuse the user.
 */
export function UpdateRequiredGate({ children }: { children: React.ReactNode }) {
  const [outdated, setOutdated] = useState(isClientOutdated());

  useEffect(() => {
    return onClientOutdated(() => setOutdated(true));
  }, []);

  if (!outdated) return <>{children}</>;
  return <UpdateRequiredScreen />;
}

function UpdateRequiredScreen() {
  const { t } = useTranslation('common');

  const openStore = () => {
    const url = Platform.OS === 'ios' ? APP_STORE_URL : PLAY_STORE_URL;
    Linking.openURL(url).catch(() => {
      // Fallback to https if the deep link isn't installed (e.g. simulator).
      const httpsUrl =
        Platform.OS === 'ios'
          ? 'https://apps.apple.com/app/atto-sound'
          : 'https://play.google.com/store/apps/details?id=com.attosound.app';
      Linking.openURL(httpsUrl).catch(() => null);
    });
  };

  return (
    <View style={styles.container}>
      <Text variant="h1" style={styles.title}>
        {t('updateRequired.title', { defaultValue: 'Update ATTO SOUND' }) as string}
      </Text>
      <Text variant="body" style={styles.body}>
        {t('updateRequired.body', {
          defaultValue:
            'This version of the app is no longer supported. Update from the store to keep using ATTO SOUND.',
        }) as string}
      </Text>
      <TouchableOpacity style={styles.button} onPress={openStore} activeOpacity={0.8}>
        <Text variant="body" style={styles.buttonText}>
          {t('updateRequired.cta', { defaultValue: 'Open the store' }) as string}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 16,
  },
  title: {
    color: '#FFFFFF',
    textAlign: 'center',
  },
  body: {
    color: '#CCCCCC',
    textAlign: 'center',
    lineHeight: 22,
  },
  button: {
    marginTop: 16,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    backgroundColor: '#3B82F6',
  },
  buttonText: {
    color: '#FFFFFF',
  },
});
