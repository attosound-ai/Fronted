import { useTranslation } from 'react-i18next';
import { ProfileSection } from './ProfileSection';
import { ProfileInfoRow } from './ProfileInfoRow';
import { formatDate } from '@/utils/formatters';
import type { User } from '@/types';

interface ProfileAccountSectionProps {
  user: User;
}

export function ProfileAccountSection({ user }: ProfileAccountSectionProps) {
  const { t } = useTranslation('profile');

  const phone =
    user.phoneCountryCode && user.phoneNumber
      ? `${user.phoneCountryCode} ${user.phoneNumber}`
      : t('account.phoneNotSet');

  return (
    <ProfileSection title={t('account.sectionTitle')}>
      <ProfileInfoRow
        icon="mail-outline"
        label={t('account.emailLabel')}
        value={user.email}
      />
      <ProfileInfoRow icon="call-outline" label={t('account.phoneLabel')} value={phone} />
      <ProfileInfoRow
        icon="calendar-outline"
        label={t('account.memberSinceLabel')}
        value={formatDate(user.createdAt)}
      />
      <ProfileInfoRow
        icon="shield-checkmark-outline"
        label={t('account.statusLabel')}
        value={
          user.registrationStatus === 'completed'
            ? t('account.statusActive')
            : t('account.statusPending')
        }
        valueColor={user.registrationStatus === 'completed' ? '#10B981' : '#F59E0B'}
        showDivider={false}
      />
    </ProfileSection>
  );
}
