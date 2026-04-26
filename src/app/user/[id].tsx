import { useLocalSearchParams } from 'expo-router';
import { PublicProfileScreen } from '@/features/profile/components/PublicProfileScreen';

export default function UserProfileRoute() {
  const { id, username, avatar, verified } = useLocalSearchParams<{
    id: string;
    username?: string;
    avatar?: string;
    verified?: string;
  }>();

  const fallback = username
    ? {
        displayName: username,
        username,
        avatar: avatar || null,
        isVerified: verified === '1',
      }
    : undefined;

  return <PublicProfileScreen userId={id} fallbackAuthor={fallback} />;
}
