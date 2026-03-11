import { useTranslation } from 'react-i18next';
import { ProfileSection } from './ProfileSection';
import { ProfileInfoRow } from './ProfileInfoRow';
import type { User } from '@/types';

interface ProfileArtistSectionProps {
  user: User;
}

export function ProfileArtistSection({ user }: ProfileArtistSectionProps) {
  const { t } = useTranslation('profile');

  return (
    <ProfileSection title={t('artist.sectionTitle')}>
      <ProfileInfoRow
        icon="musical-notes-outline"
        label={t('artist.artistNameLabel')}
        value={user.artistName ?? t('artist.artistNameNotSet')}
      />
      <ProfileInfoRow
        icon="id-card-outline"
        label={t('artist.inmateNumberLabel')}
        value={user.inmateNumber ?? t('artist.inmateNumberNotSet')}
      />
      <ProfileInfoRow
        icon="checkmark-circle-outline"
        label={t('artist.verifiedLabel')}
        value={
          user.profileVerified ? t('artist.verifiedYes') : t('artist.verifiedPending')
        }
        valueColor={user.profileVerified ? '#10B981' : '#F59E0B'}
        showDivider={false}
      />
    </ProfileSection>
  );
}
