import { useLocalSearchParams } from 'expo-router';
import { PublicProfileScreen } from '@/features/profile/components/PublicProfileScreen';

export default function UserProfileRoute() {
  const { id, displayName, username, avatar, verified } = useLocalSearchParams<{
    id: string;
    displayName?: string;
    username?: string;
    avatar?: string;
    verified?: string;
  }>();

  const fallback =
    displayName && username
      ? {
          displayName,
          username,
          avatar: avatar || null,
          isVerified: verified === '1',
        }
      : undefined;

  return <PublicProfileScreen userId={id} fallbackAuthor={fallback} />;
}
