import { ScrollView, StyleSheet } from 'react-native';

import { COLORS } from '@/constants/theme';
import { ProfileSecuritySection } from '@/features/profile/components/ProfileSecuritySection';
import { useAuthStore } from '@/stores/authStore';

/**
 * Two factor authentication: the enable and disable flows need a code and a
 * password, which live in the existing section's sheets; this screen hosts
 * it under the native settings stack.
 */
export default function SecuritySettingsScreen() {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ProfileSecuritySection user={user} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background.primary },
  content: { padding: 16, paddingBottom: 40 },
});
