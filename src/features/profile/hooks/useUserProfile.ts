import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { useFollowStore } from '@/stores/followStore';
import type { User } from '@/types';

export function useUserProfile(userId: string) {
  const numericId = Number(userId);
  const queryClient = useQueryClient();
  const { setFollowed, getIsFollowing } = useFollowStore();

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

  // Effective follow state: global store overrides stale server data
  const effectiveIsFollowing = getIsFollowing(numericId, user?.isFollowing ?? false);

  const followMutation = useMutation({
    mutationFn: async ({ wasFollowing }: { wasFollowing: boolean }) => {
      if (wasFollowing) {
        await apiClient.delete(API_ENDPOINTS.USERS.FOLLOW(numericId));
      } else {
        await apiClient.post(API_ENDPOINTS.USERS.FOLLOW(numericId));
      }
    },
    onMutate: async ({ wasFollowing }) => {
      // Update global store immediately (syncs feed, reels, search)
      setFollowed(numericId, !wasFollowing);

      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.USERS.PROFILE(numericId) });
      const previous = queryClient.getQueryData<User>(
        QUERY_KEYS.USERS.PROFILE(numericId)
      );
      if (previous) {
        queryClient.setQueryData<User>(QUERY_KEYS.USERS.PROFILE(numericId), {
          ...previous,
          isFollowing: !wasFollowing,
          followersCount: wasFollowing
            ? previous.followersCount - 1
            : previous.followersCount + 1,
        });
      }
      return { previous, wasFollowing };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEYS.USERS.PROFILE(numericId), context.previous);
      }
      // Revert global store
      if (context !== undefined) {
        setFollowed(numericId, context.wasFollowing);
      }
    },
  });

  return {
    user: user ? { ...user, isFollowing: effectiveIsFollowing } : null,
    isLoading,
    error,
    toggleFollow: () =>
      followMutation.mutate({ wasFollowing: effectiveIsFollowing }),
    isToggling: followMutation.isPending,
  };
}
