/**
 * useCommentActions — edit and delete comments with optimistic updates.
 * Mirrors useMessageActions pattern.
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { feedService } from '../services/feedService';
import {
  cancelPostQueries,
  snapshotPostCaches,
  rollbackPostCaches,
  patchPostInCaches,
} from '../utils/postCacheSync';
import type { Comment } from './useComments';

export function useCommentActions(postId: string) {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  /** Update a comment (or nested reply) across all infinite query pages. */
  const updateComment = useCallback(
    (commentId: string, updater: (c: Comment) => Comment) => {
      queryClient.setQueryData(
        QUERY_KEYS.FEED.COMMENTS(postId),
        (old: { pages: any[]; pageParams: unknown[] } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page: any) => ({
              ...page,
              data: (page.data ?? []).map((c: Comment) => {
                const updated = c.id === commentId ? updater(c) : c;
                return {
                  ...updated,
                  replies: updated.replies?.map((r: Comment) =>
                    r.id === commentId ? updater(r) : r
                  ),
                };
              }),
            })),
          };
        }
      );
    },
    [postId, queryClient]
  );

  const editComment = useCallback(
    async (commentId: string, newText: string) => {
      if (!userId) return;

      const snapshot = queryClient.getQueryData(QUERY_KEYS.FEED.COMMENTS(postId));

      updateComment(commentId, (c) => ({
        ...c,
        comment: newText,
        isEdited: true,
      }));

      try {
        await feedService.editComment(postId, commentId, newText);
      } catch {
        queryClient.setQueryData(QUERY_KEYS.FEED.COMMENTS(postId), snapshot);
      }
    },
    [postId, userId, updateComment, queryClient]
  );

  const deleteComment = useCallback(
    async (commentId: string) => {
      if (!userId) return;

      const commentsSnapshot = queryClient.getQueryData(QUERY_KEYS.FEED.COMMENTS(postId));
      await cancelPostQueries(queryClient, postId);
      const postSnapshot = snapshotPostCaches(queryClient, postId);

      // Optimistic: remove from list
      queryClient.setQueryData(
        QUERY_KEYS.FEED.COMMENTS(postId),
        (old: { pages: any[]; pageParams: unknown[] } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page: any) => ({
              ...page,
              data: (page.data ?? [])
                .filter((c: Comment) => c.id !== commentId)
                .map((c: Comment) => ({
                  ...c,
                  replies: c.replies?.filter((r: Comment) => r.id !== commentId),
                })),
            })),
          };
        }
      );

      // Optimistic: decrement count
      patchPostInCaches(queryClient, postId, (post) => ({
        ...post,
        commentsCount: Math.max(0, (post.commentsCount || 0) - 1),
      }));

      try {
        await feedService.deleteComment(postId, commentId);
      } catch {
        queryClient.setQueryData(QUERY_KEYS.FEED.COMMENTS(postId), commentsSnapshot);
        rollbackPostCaches(queryClient, postId, postSnapshot);
      }
    },
    [postId, userId, queryClient]
  );

  const canEditOrDelete = useCallback(
    (authorId: string) => (userId ? String(userId) === authorId : false),
    [userId]
  );

  return { editComment, deleteComment, canEditOrDelete };
}
