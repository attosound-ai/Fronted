import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { useFollowStore } from '@/stores/followStore';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';

export function useUserProfile(userId: string) {
  const numericId = Number(userId);
  const queryClient = useQueryClient();
  const { setFollowed, getIsFollowing } = useFollowStore();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const isOwnProfile = currentUserId === numericId;

  const {
    data: user,
    isLoading,
    isFetching,
    isPlaceholderData,
    refetch,
    error,
  } = useQuery<User>({
    queryKey: QUERY_KEYS.USERS.PROFILE(numericId),
    queryFn: async () => {
      // Fetch user profile + real counts from social-service in parallel
      const [profileRes, statsRes] = await Promise.all([
        apiClient.get(API_ENDPOINTS.USERS.PROFILE(numericId)),
        apiClient.get(API_ENDPOINTS.USERS.STATS(numericId)),
      ]);
      const profile = profileRes.data.data;
      const stats = statsRes.data?.data;
      if (stats) {
        profile.followersCount = stats.followersCount;
        profile.followingCount = stats.followingCount;
        profile.postsCount = stats.postsCount;
      }
      return profile;
    },
    enabled: !isNaN(numericId) && numericId > 0,
    staleTime: isOwnProfile ? 30_000 : 5 * 60 * 1000, // 5 min for other profiles
    gcTime: 30 * 60 * 1000, // Keep in memory 30 min
    // Instant render: use seeded cache data as placeholder while full profile loads
    placeholderData: () =>
      queryClient.getQueryData<User>(QUERY_KEYS.USERS.PROFILE(numericId)),
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
    onSuccess: () => {
      // Invalidate the current user's own profile to update followingCount
      if (currentUserId && currentUserId !== numericId) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.USERS.PROFILE(currentUserId),
        });
      }
    },
    onError: (err: unknown, _vars, context) => {
      // 409 = already following/unfollowed — state is correct, don't revert
      if ((err as any)?.response?.status === 409) return;
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEYS.USERS.PROFILE(numericId), context.previous);
      }
      // Revert global store
      if (context !== undefined) {
        setFollowed(numericId, context.wasFollowing);
      }
    },
  });

  // True when we have seeded/partial data but real profile is still loading
  const isPartial = isFetching && !!user && user.followersCount === undefined;

  return {
    user: user ? { ...user, isFollowing: effectiveIsFollowing } : null,
    isLoading,
    isFetching,
    isPartial,
    isPlaceholderData,
    error,
    refetch,
    toggleFollow: () =>
      followMutation.mutate({ wasFollowing: effectiveIsFollowing }),
    isToggling: followMutation.isPending,
  };
}
