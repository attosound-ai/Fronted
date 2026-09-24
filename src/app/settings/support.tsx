import { ScrollView, StyleSheet } from 'react-native';

import { COLORS } from '@/constants/theme';
import { ProfileSupportSection } from '@/features/profile/components/ProfileSupportSection';

/** The support form (Sentry feedback + PostHog) under the native settings stack. */
export default function SupportSettingsScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ProfileSupportSection />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background.primary },
  content: { padding: 16, paddingBottom: 40 },
});
