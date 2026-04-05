import { useTranslation } from 'react-i18next';
import { Music, IdCard, CheckCircle } from 'lucide-react-native';
import { ProfileSection } from './ProfileSection';
import { ProfileInfoRow } from './ProfileInfoRow';
import type { User } from '@/types';

interface ProfileCreatorSectionProps {
  user: User;
}

export function ProfileCreatorSection({ user }: ProfileCreatorSectionProps) {
  const { t } = useTranslation('profile');

  return (
    <ProfileSection title={t('creator.sectionTitle')}>
      <ProfileInfoRow
        icon={<Music size={18} color="#888888" strokeWidth={2.25} />}
        label={t('creator.creatorNameLabel')}
        value={user.creatorName ?? t('creator.creatorNameNotSet')}
      />
      <ProfileInfoRow
        icon={<IdCard size={18} color="#888888" strokeWidth={2.25} />}
        label={t('creator.inmateNumberLabel')}
        value={user.inmateNumber ?? t('creator.inmateNumberNotSet')}
      />
      <ProfileInfoRow
        icon={<CheckCircle size={18} color="#888888" strokeWidth={2.25} />}
        label={t('creator.verifiedLabel')}
        value={
          user.profileVerified ? t('creator.verifiedYes') : t('creator.verifiedPending')
        }
        valueColor={user.profileVerified ? '#10B981' : '#F59E0B'}
        showDivider={false}
      />
    </ProfileSection>
  );
}
