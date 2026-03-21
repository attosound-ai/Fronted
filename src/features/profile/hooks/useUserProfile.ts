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
    error,
  } = useQuery<User>({
    queryKey: QUERY_KEYS.USERS.PROFILE(numericId),
    queryFn: async () => {
      // Fetch user profile + real counts from social-service in parallel
      const [profileRes, followersRes, followingRes, postsRes] = await Promise.all([
        apiClient.get(API_ENDPOINTS.USERS.PROFILE(numericId)),
        apiClient.get(API_ENDPOINTS.USERS.FOLLOWERS(numericId), { params: { page: 1, limit: 1 } }),
        apiClient.get(API_ENDPOINTS.USERS.FOLLOWING(numericId), { params: { page: 1, limit: 1 } }),
        apiClient.get(API_ENDPOINTS.POSTS.USER_POSTS(numericId), { params: { limit: 1 } }),
      ]);
      const profile = profileRes.data.data;
      // Use real counts from social-service instead of stale user-service columns
      profile.followersCount = followersRes.data?.meta?.pagination?.total ?? profile.followersCount;
      profile.followingCount = followingRes.data?.meta?.pagination?.total ?? profile.followingCount;
      profile.postsCount = postsRes.data?.meta?.total ?? postsRes.data?.data?.length ?? profile.postsCount;
      return profile;
    },
    enabled: !isNaN(numericId) && numericId > 0,
    staleTime: isOwnProfile ? 30_000 : 1000 * 60 * 5,
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

  return {
    user: user ? { ...user, isFollowing: effectiveIsFollowing } : null,
    isLoading,
    error,
    toggleFollow: () =>
      followMutation.mutate({ wasFollowing: effectiveIsFollowing }),
    isToggling: followMutation.isPending,
  };
}
