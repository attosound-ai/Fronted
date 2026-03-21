import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { phoenixSocket } from '@/lib/api/phoenixSocket';
import { patchPostInCaches } from '../utils/postCacheSync';

/**
 * Subscribe to real-time interaction updates for a post via WebSocket.
 * Ignores events from the current user (already handled optimistically).
 */
export function usePostChannel(postId: string | null) {
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((s) => s.user?.id);

  useEffect(() => {
    if (!postId) return;

    phoenixSocket.joinPostChannel(postId, {
      onInteractionUpdate: (payload) => {
        // Ignore own actions — already handled optimistically
        if (String(payload.user_id) === String(currentUserId)) return;

        const delta = payload.action === 'created' ? 1 : -1;

        patchPostInCaches(queryClient, postId, (post) => {
          switch (payload.type) {
            case 'like':
              return { ...post, likesCount: Math.max(0, post.likesCount + delta) };
            case 'comment':
              return {
                ...post,
                commentsCount: Math.max(0, (post.commentsCount || 0) + delta),
              };
            case 'repost':
              return {
                ...post,
                repostsCount: Math.max(0, (post.repostsCount ?? 0) + delta),
              };
            case 'share':
              return {
                ...post,
                sharesCount: Math.max(0, (post.sharesCount ?? 0) + delta),
              };
            default:
              return post;
          }
        });

        // Refresh comments list when another user comments
        if (payload.type === 'comment' && payload.action === 'created') {
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.FEED.COMMENTS(postId) });
        }
      },
    });

    return () => {
      phoenixSocket.leavePostChannel(postId);
    };
  }, [postId, currentUserId, queryClient]);
}
