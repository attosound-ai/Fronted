import { ProfileSection } from './ProfileSection';
import { ProfileInfoRow } from './ProfileInfoRow';
import type { User } from '@/types';

interface ProfileRepresentativeSectionProps {
  user: User;
}

export function ProfileRepresentativeSection({
  user,
}: ProfileRepresentativeSectionProps) {
  const artistPhone = user.artistPhone ?? 'Not set';
  const artistEmail = user.artistEmail ?? 'Not set';

  return (
    <ProfileSection title="Representative Details">
      <ProfileInfoRow
        icon="musical-notes-outline"
        label="Artist Name"
        value={user.artistName ?? 'Not set'}
      />
      <ProfileInfoRow
        icon="id-card-outline"
        label="Inmate Number"
        value={user.inmateNumber ?? 'Not set'}
      />
      <ProfileInfoRow
        icon="location-outline"
        label="Inmate State"
        value={user.inmateState ?? 'Not set'}
      />
      <ProfileInfoRow
        icon="people-outline"
        label="Relationship"
        value={user.relationship ?? 'Not set'}
      />
      <ProfileInfoRow icon="mail-outline" label="Artist Email" value={artistEmail} />
      <ProfileInfoRow icon="call-outline" label="Artist Phone" value={artistPhone} />
      <ProfileInfoRow
        icon="mic-outline"
        label="Consent to Record"
        value={user.consentToRecording ? 'Yes' : 'No'}
        valueColor={user.consentToRecording ? '#10B981' : '#EF4444'}
      />
      <ProfileInfoRow
        icon="checkmark-circle-outline"
        label="Verified"
        value={user.profileVerified ? 'Yes' : 'Pending'}
        valueColor={user.profileVerified ? '#10B981' : '#F59E0B'}
        showDivider={false}
      />
    </ProfileSection>
  );
}
