import { useTranslation } from 'react-i18next';
import { ProfileSection } from './ProfileSection';
import { ProfileInfoRow } from './ProfileInfoRow';
import type { User } from '@/types';

interface ProfileRepresentativeSectionProps {
  user: User;
}

export function ProfileRepresentativeSection({
  user,
}: ProfileRepresentativeSectionProps) {
  const { t } = useTranslation('profile');

  const artistPhone = user.artistPhone ?? t('representative.artistPhoneNotSet');
  const artistEmail = user.artistEmail ?? t('representative.artistEmailNotSet');

  return (
    <ProfileSection title={t('representative.sectionTitle')}>
      <ProfileInfoRow
        icon="musical-notes-outline"
        label={t('representative.artistNameLabel')}
        value={user.artistName ?? t('representative.artistNameNotSet')}
      />
      <ProfileInfoRow
        icon="id-card-outline"
        label={t('representative.inmateNumberLabel')}
        value={user.inmateNumber ?? t('representative.inmateNumberNotSet')}
      />
      <ProfileInfoRow
        icon="location-outline"
        label={t('representative.inmateStateLabel')}
        value={user.inmateState ?? t('representative.inmateStateNotSet')}
      />
      <ProfileInfoRow
        icon="people-outline"
        label={t('representative.relationshipLabel')}
        value={user.relationship ?? t('representative.relationshipNotSet')}
      />
      <ProfileInfoRow
        icon="mail-outline"
        label={t('representative.artistEmailLabel')}
        value={artistEmail}
      />
      <ProfileInfoRow
        icon="call-outline"
        label={t('representative.artistPhoneLabel')}
        value={artistPhone}
      />
      <ProfileInfoRow
        icon="mic-outline"
        label={t('representative.consentToRecordLabel')}
        value={
          user.consentToRecording
            ? t('representative.consentYes')
            : t('representative.consentNo')
        }
        valueColor={user.consentToRecording ? '#10B981' : '#EF4444'}
      />
      <ProfileInfoRow
        icon="checkmark-circle-outline"
        label={t('representative.verifiedLabel')}
        value={
          user.profileVerified
            ? t('representative.verifiedYes')
            : t('representative.verifiedPending')
        }
        valueColor={user.profileVerified ? '#10B981' : '#F59E0B'}
        showDivider={false}
      />
    </ProfileSection>
  );
}
