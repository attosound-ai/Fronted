import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { QUERY_KEYS } from '@/constants/queryKeys';

/**
 * Fetch a participant's profile (avatar + display name).
 * Used by ConversationItem, ChatHeader, etc.
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
    displayName: (data?.displayName as string | null) ?? null,
    role: (data?.role as string | null) ?? null,
  };
}

/** @deprecated Use useParticipantProfile instead */
export function useParticipantAvatar(participantId: string) {
  return useParticipantProfile(participantId).avatarUri;
}
