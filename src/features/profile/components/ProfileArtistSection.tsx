import { ProfileSection } from './ProfileSection';
import { ProfileInfoRow } from './ProfileInfoRow';
import type { User } from '@/types';

interface ProfileArtistSectionProps {
  user: User;
}

export function ProfileArtistSection({ user }: ProfileArtistSectionProps) {
  return (
    <ProfileSection title="Artist Details">
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
        icon="checkmark-circle-outline"
        label="Verified"
        value={user.profileVerified ? 'Yes' : 'Pending'}
        valueColor={user.profileVerified ? '#10B981' : '#F59E0B'}
        showDivider={false}
      />
    </ProfileSection>
  );
}
