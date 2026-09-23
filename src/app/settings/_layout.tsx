import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { COLORS } from '@/constants/theme';

/**
 * Settings, navigated like Apple's: a native stack with large titles, each
 * choice pushed as its own screen with the back chevron.
 */
export default function SettingsLayout() {
  const { t } = useTranslation('profile');
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerLargeTitle: true,
        headerLargeTitleShadowVisible: false,
        headerShadowVisible: false,
        headerBackTitle: '',
        headerTintColor: '#FFFFFF',
        headerStyle: { backgroundColor: COLORS.background.primary },
        headerLargeStyle: { backgroundColor: COLORS.background.primary },
        contentStyle: { backgroundColor: COLORS.background.primary },
      }}
    >
      <Stack.Screen name="index" options={{ title: t('settings.title') }} />
      <Stack.Screen name="recorder" options={{ title: t('settings.recorderLabel') }} />
      <Stack.Screen name="language" options={{ title: t('settings.languageLabel') }} />
    </Stack>
  );
}
