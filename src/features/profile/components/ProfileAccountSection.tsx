import { ProfileSection } from './ProfileSection';
import { ProfileInfoRow } from './ProfileInfoRow';
import { formatDate } from '@/utils/formatters';
import type { User } from '@/types';

interface ProfileAccountSectionProps {
  user: User;
}

export function ProfileAccountSection({ user }: ProfileAccountSectionProps) {
  const phone =
    user.phoneCountryCode && user.phoneNumber
      ? `${user.phoneCountryCode} ${user.phoneNumber}`
      : 'Not set';

  return (
    <ProfileSection title="Account">
      <ProfileInfoRow icon="mail-outline" label="Email" value={user.email} />
      <ProfileInfoRow icon="call-outline" label="Phone" value={phone} />
      <ProfileInfoRow
        icon="calendar-outline"
        label="Member since"
        value={formatDate(user.createdAt)}
      />
      <ProfileInfoRow
        icon="shield-checkmark-outline"
        label="Status"
        value={user.registrationStatus === 'completed' ? 'Active' : 'Pending'}
        valueColor={user.registrationStatus === 'completed' ? '#10B981' : '#F59E0B'}
        showDivider={false}
      />
    </ProfileSection>
  );
}
