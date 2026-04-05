import { useTranslation } from 'react-i18next';
import {
  Music,
  IdCard,
  MapPin,
  Users,
  Mail,
  Phone,
  Mic,
  CheckCircle,
} from 'lucide-react-native';
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

  const creatorPhone = user.creatorPhone ?? t('representative.creatorPhoneNotSet');
  const creatorEmail = user.creatorEmail ?? t('representative.creatorEmailNotSet');

  return (
    <ProfileSection title={t('representative.sectionTitle')}>
      <ProfileInfoRow
        icon={<Music size={18} color="#888888" strokeWidth={2.25} />}
        label={t('representative.creatorNameLabel')}
        value={user.creatorName ?? t('representative.creatorNameNotSet')}
      />
      <ProfileInfoRow
        icon={<IdCard size={18} color="#888888" strokeWidth={2.25} />}
        label={t('representative.inmateNumberLabel')}
        value={user.inmateNumber ?? t('representative.inmateNumberNotSet')}
      />
      <ProfileInfoRow
        icon={<MapPin size={18} color="#888888" strokeWidth={2.25} />}
        label={t('representative.inmateStateLabel')}
        value={user.inmateState ?? t('representative.inmateStateNotSet')}
      />
      <ProfileInfoRow
        icon={<Users size={18} color="#888888" strokeWidth={2.25} />}
        label={t('representative.relationshipLabel')}
        value={user.relationship ?? t('representative.relationshipNotSet')}
      />
      <ProfileInfoRow
        icon={<Mail size={18} color="#888888" strokeWidth={2.25} />}
        label={t('representative.creatorEmailLabel')}
        value={creatorEmail}
      />
      <ProfileInfoRow
        icon={<Phone size={18} color="#888888" strokeWidth={2.25} />}
        label={t('representative.creatorPhoneLabel')}
        value={creatorPhone}
      />
      <ProfileInfoRow
        icon={<Mic size={18} color="#888888" strokeWidth={2.25} />}
        label={t('representative.consentToRecordLabel')}
        value={
          user.consentToRecording
            ? t('representative.consentYes')
            : t('representative.consentNo')
        }
        valueColor={user.consentToRecording ? '#10B981' : '#EF4444'}
      />
      <ProfileInfoRow
        icon={<CheckCircle size={18} color="#888888" strokeWidth={2.25} />}
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
