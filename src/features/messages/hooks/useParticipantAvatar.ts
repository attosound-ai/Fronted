import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { QUERY_KEYS } from '@/constants/queryKeys';

/**
 * Fetch a participant's profile. Used by ConversationItem, ChatHeader and the
 * chat details screen, which also shows the real name and the bio the way
 * Telegram does.
 */
export function useParticipantProfile(participantId: string) {
  const numericId = Number(participantId);

  const { data } = useQuery({
    queryKey: QUERY_KEYS.USERS.PROFILE(numericId),
    queryFn: async () => {
      const response = await apiClient.get(API_ENDPOINTS.USERS.PROFILE(numericId));
      return response.data.data;
    },
    enabled: !isNaN(numericId) && numericId > 0,
    staleTime: 1000 * 60 * 30, // 30 minutes
  });

  return {
    avatarUri: (data?.avatar as string | null) ?? null,
    username: (data?.username as string | null) ?? null,
    role: (data?.role as string | null) ?? null,
    displayName: (data?.displayName as string | null) ?? null,
    bio: (data?.bio as string | null) ?? null,
  };
}

/** @deprecated Use useParticipantProfile instead */
export function useParticipantAvatar(participantId: string) {
  return useParticipantProfile(participantId).avatarUri;
}
