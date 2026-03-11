import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';

/**
 * Manages optimistic follow/unfollow state for feed lists.
 * Keeps a local override map so the UI reflects changes instantly
 * without waiting for a feed refresh.
 */
export function useFollowFeed() {
  // userId → isFollowing override (set after user taps Follow/Unfollow)
  const [followStates, setFollowStates] = useState<Record<number, boolean>>({});

  const { mutate } = useMutation({
    mutationFn: ({ userId }: { userId: number }) =>
      apiClient.post(API_ENDPOINTS.USERS.FOLLOW(userId)),
  });

  const toggleFollow = (userId: number, currentIsFollowing: boolean) => {
    setFollowStates((prev) => ({ ...prev, [userId]: !currentIsFollowing }));
    mutate(
      { userId },
      {
        onError: () => {
          // Revert on API failure
          setFollowStates((prev) => ({ ...prev, [userId]: currentIsFollowing }));
        },
      }
    );
  };

  /** Returns the effective isFollowing state, preferring the local override. */
  const getIsFollowing = (userId: number, fallback: boolean) =>
    followStates[userId] ?? fallback;

  return { toggleFollow, getIsFollowing };
}
