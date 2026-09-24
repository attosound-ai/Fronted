import { ScrollView, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { COLORS } from '@/constants/theme';
import { ProfileSupportSection } from '@/features/profile/components/ProfileSupportSection';

/** The support form (Sentry feedback + PostHog) under the native settings stack. */
export default function SupportSettingsScreen() {
  const { t } = useTranslation('profile');
  return (
    <>
      <Stack.Screen options={{ title: t('support.sectionTitle') }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <ProfileSupportSection />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background.primary },
  content: { padding: 16, paddingBottom: 40 },
});
