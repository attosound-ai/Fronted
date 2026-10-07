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
import {
  reportSocialAction,
  reportSocialActionFailed,
} from '@/lib/analytics/socialTelemetry';
import { removedWith } from '../comments/commentCount';
import { reconcileCommentCount } from '../comments/reconcileCommentCount';
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
        reportSocialAction('comment_edit', postId, 'applied', {
          comment_id: commentId,
        });
      } catch (error: unknown) {
        // Was a silent revert: the edit vanished from screen with no trace.
        queryClient.setQueryData(QUERY_KEYS.FEED.COMMENTS(postId), snapshot);
        reportSocialActionFailed('comment_edit', postId, error, {
          comment_id: commentId,
        });
      }
    },
    [postId, userId, updateComment, queryClient]
  );

  const deleteComment = useCallback(
    async (commentId: string) => {
      if (!userId) return;

      const commentsSnapshot = queryClient.getQueryData<{
        pages: { data?: Comment[] }[];
      }>(QUERY_KEYS.FEED.COMMENTS(postId));
      await cancelPostQueries(queryClient, postId);
      const postSnapshot = snapshotPostCaches(queryClient, postId);
      // A comment leaves with its replies: the number drops by all of them.
      const leaving = removedWith(
        (commentsSnapshot?.pages ?? []).flatMap((page) => page.data ?? []),
        commentId
      );

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
        commentsCount: Math.max(0, (post.commentsCount || 0) - leaving),
      }));

      try {
        await feedService.deleteComment(postId, commentId);
        await reconcileCommentCount(queryClient, postId, 'comment_delete');
        reportSocialAction('comment_delete', postId, 'applied', {
          comment_id: commentId,
        });
      } catch (error: unknown) {
        queryClient.setQueryData(QUERY_KEYS.FEED.COMMENTS(postId), commentsSnapshot);
        rollbackPostCaches(queryClient, postId, postSnapshot);
        reportSocialActionFailed('comment_delete', postId, error, {
          comment_id: commentId,
        });
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
