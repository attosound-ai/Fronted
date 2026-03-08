import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { User } from '@/types';

export function useUserProfile(userId: string) {
  const numericId = Number(userId);
  const queryClient = useQueryClient();

  const {
    data: user,
    isLoading,
    error,
  } = useQuery<User>({
    queryKey: QUERY_KEYS.USERS.PROFILE(numericId),
    queryFn: async () => {
      const response = await apiClient.get(API_ENDPOINTS.USERS.PROFILE(numericId));
      return response.data.data;
    },
    enabled: !isNaN(numericId) && numericId > 0,
    staleTime: 1000 * 60 * 5,
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post(API_ENDPOINTS.USERS.FOLLOW(numericId));
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.USERS.PROFILE(numericId) });
      const previous = queryClient.getQueryData<User>(QUERY_KEYS.USERS.PROFILE(numericId));
      if (previous) {
        queryClient.setQueryData<User>(QUERY_KEYS.USERS.PROFILE(numericId), {
          ...previous,
          isFollowing: !previous.isFollowing,
          followersCount: previous.isFollowing
            ? previous.followersCount - 1
            : previous.followersCount + 1,
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEYS.USERS.PROFILE(numericId), context.previous);
      }
    },
  });

  return {
    user: user ?? null,
    isLoading,
    error,
    toggleFollow: () => followMutation.mutate(),
    isToggling: followMutation.isPending,
  };
}
