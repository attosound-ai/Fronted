import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { Mail, Phone, Calendar, ShieldCheck } from 'lucide-react-native';
import { ProfileSection } from './ProfileSection';
import { ProfileInfoRow } from './ProfileInfoRow';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/utils/formatters';
import type { User } from '@/types';

interface ProfileAccountSectionProps {
  user: User;
}

export function ProfileAccountSection({ user }: ProfileAccountSectionProps) {
  const { t } = useTranslation('profile');

  const showCreateCreator = user.role === 'listener';

  const phone =
    user.phoneCountryCode && user.phoneNumber
      ? `${user.phoneCountryCode} ${user.phoneNumber}`
      : t('account.phoneNotSet');

  return (
    <ProfileSection title={t('account.sectionTitle')}>
      <ProfileInfoRow
        icon={<Mail size={18} color="#888888" strokeWidth={2.25} />}
        label={t('account.emailLabel')}
        value={user.email}
      />
      <ProfileInfoRow
        icon={<Phone size={18} color="#888888" strokeWidth={2.25} />}
        label={t('account.phoneLabel')}
        value={phone}
      />
      <ProfileInfoRow
        icon={<Calendar size={18} color="#888888" strokeWidth={2.25} />}
        label={t('account.memberSinceLabel')}
        value={formatDate(user.createdAt)}
      />
      <ProfileInfoRow
        icon={<ShieldCheck size={18} color="#888888" strokeWidth={2.25} />}
        label={t('account.statusLabel')}
        value={
          user.registrationStatus === 'completed'
            ? t('account.statusActive')
            : t('account.statusPending')
        }
        valueColor={user.registrationStatus === 'completed' ? '#10B981' : '#F59E0B'}
        showDivider={!showCreateCreator}
      />
      {showCreateCreator && (
        <View style={styles.createCreatorRow}>
          <Button
            title={t('account.createCreatorAccount')}
            variant="outline"
            onPress={() => router.push('/(auth)/register?mode=creator')}
          />
        </View>
      )}
    </ProfileSection>
  );
}

const styles = StyleSheet.create({
  createCreatorRow: {
    paddingTop: 16,
  },
});
