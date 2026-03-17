import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { useFollowStore } from '@/stores/followStore';

/**
 * Manages optimistic follow/unfollow state for feed lists.
 * Uses the global followStore so state is shared across feed, reels, and profiles.
 */
export function useFollowFeed() {
  const { setFollowed, getIsFollowing } = useFollowStore();

  const { mutate } = useMutation({
    mutationFn: ({ userId, isFollowing }: { userId: number; isFollowing: boolean }) =>
      isFollowing
        ? apiClient.delete(API_ENDPOINTS.USERS.FOLLOW(userId))
        : apiClient.post(API_ENDPOINTS.USERS.FOLLOW(userId)),
  });

  const toggleFollow = (userId: number, currentIsFollowing: boolean) => {
    // Optimistic update in global store
    setFollowed(userId, !currentIsFollowing);
    mutate(
      { userId, isFollowing: currentIsFollowing },
      {
        onError: () => {
          // Revert on API failure
          setFollowed(userId, currentIsFollowing);
        },
      }
    );
  };

  return { toggleFollow, getIsFollowing };
}
