import { useCallback, useMemo } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { feedService } from '../services/feedService';
import { cancelPostQueries, patchPostInCaches } from '../utils/postCacheSync';
import {
  find,
  newPendingComment,
  pendingFor,
  type PendingComment,
  type PendingStatus,
} from '../comments/commentOutbox';
import { useCommentOutbox } from '../comments/commentOutboxStore';
import { reconcileCommentCount } from '../comments/reconcileCommentCount';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import {
  reportSocialAction,
  reportSocialActionFailed,
} from '@/lib/analytics/socialTelemetry';
import type { Role } from '@/types';

export interface CommentAuthor {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  role?: Role;
}

export interface Comment {
  id: string;
  userId: string;
  contentId: string;
  comment: string;
  parentId?: string | null;
  createdAt: string;
  isEdited?: boolean;
  isDeleted?: boolean;
  /** Set only while the comment exists on this phone and not on the server:
   *  on its way, or failed and waiting to be sent again. */
  status?: PendingStatus;
  author?: CommentAuthor;
  replies?: Comment[];
}

export function useComments(postId: string) {
  const queryClient = useQueryClient();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch } =
    useInfiniteQuery({
      queryKey: QUERY_KEYS.FEED.COMMENTS(postId),
      queryFn: async ({ pageParam = 1 }) => {
        const res = await feedService.getComments(postId, pageParam, 20);
        return res;
      },
      initialPageParam: 1,
      getNextPageParam: (lastPage: any) => {
        const pagination = lastPage?.meta?.pagination;
        if (!pagination) return undefined;
        return pagination.page < pagination.totalPages ? pagination.page + 1 : undefined;
      },
      enabled: !!postId,
    });

  // ── Sending a comment ───────────────────────────────────────────────
  // A comment the server does not have yet lives in the outbox, not in the
  // list that comes from the server: on its way it shows as "Posting…", and
  // if the request fails it stays there, marked, to be sent again or
  // discarded. It used to be removed without a word (see commentOutbox).
  const pending = useCommentOutbox((state) => pendingFor(state.outbox, postId));

  const bumpCount = useCallback(
    (delta: number) => {
      patchPostInCaches(queryClient, postId, (post) => ({
        ...post,
        commentsCount: Math.max(0, (post.commentsCount || 0) + delta),
      }));
    },
    [queryClient, postId]
  );

  const send = useCallback(
    async (entry: PendingComment) => {
      const box = useCommentOutbox.getState();
      try {
        const res = await feedService.addComment(
          postId,
          entry.text,
          entry.parentId ?? undefined
        );
        // The server's copy goes into the list in the same breath as the
        // pending one leaves, so the comment never blinks out of sight while
        // the list reloads.
        const saved = (res as { data?: Partial<Comment> } | undefined)?.data;
        if (saved?.id) {
          const user = useAuthStore.getState().user;
          const serverComment: Comment = {
            ...toComment(entry, user),
            ...saved,
            id: String(saved.id),
            status: undefined,
          };
          queryClient.setQueryData(QUERY_KEYS.FEED.COMMENTS(postId), (old: any) => {
            if (!old?.pages?.length) return old;
            const known = old.pages.some((page: any) =>
              (page.data ?? []).some((c: Comment) => c.id === serverComment.id)
            );
            if (known) return old;
            return {
              ...old,
              pages: old.pages.map((page: any, i: number) =>
                i === 0 ? { ...page, data: [serverComment, ...(page.data ?? [])] } : page
              ),
            };
          });
        }
        box.remove(postId, entry.id);
        void queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.FEED.COMMENTS(postId),
        });

        await reconcileCommentCount(queryClient, postId, 'comment_create');
        reportSocialAction('comment_create', postId, 'applied', {
          attempts: entry.attempts,
        });
      } catch (err) {
        reportSocialActionFailed('comment_create', postId, err, {
          attempts: entry.attempts,
          kept_for_retry: true,
        });
        // The server never got it: it stops counting, and it stays in sight.
        bumpCount(-1);
        box.markFailed(postId, entry.id);
      }
    },
    [postId, queryClient, bumpCount]
  );

  const addComment = useCallback(
    async (text: string, parentId?: string) => {
      const entry = newPendingComment(postId, text, parentId, Date.now());
      await cancelPostQueries(queryClient, postId);
      useCommentOutbox.getState().enqueue(entry);
      bumpCount(1);
      await send(entry);
    },
    [postId, queryClient, bumpCount, send]
  );

  const retryComment = useCallback(
    async (id: string) => {
      const box = useCommentOutbox.getState();
      const failed = find(box.outbox, postId, id);
      // Only a failed comment is sent again; one on its way already is.
      if (!failed || failed.status !== 'failed') return;
      box.markRetrying(postId, id);
      const entry = find(useCommentOutbox.getState().outbox, postId, id);
      if (!entry) return;
      analytics.capture(ANALYTICS_EVENTS.SOCIAL.COMMENT_RETRIED, {
        target_id: postId,
        attempts: entry.attempts,
      });
      await cancelPostQueries(queryClient, postId);
      bumpCount(1);
      await send(entry);
    },
    [postId, queryClient, bumpCount, send]
  );

  const discardComment = useCallback(
    (id: string) => {
      const box = useCommentOutbox.getState();
      const entry = find(box.outbox, postId, id);
      if (!entry) return;
      // One still on its way was counted; a failed one was not.
      if (entry.status === 'sending') bumpCount(-1);
      box.remove(postId, id);
      analytics.capture(ANALYTICS_EVENTS.SOCIAL.COMMENT_DISCARDED, {
        target_id: postId,
        attempts: entry.attempts,
      });
    },
    [postId, bumpCount]
  );

  const serverComments: Comment[] =
    data?.pages.flatMap((page: any) => page.data ?? []) ?? [];
  // What is only on this phone goes first, newest on top, then the server's.
  const comments: Comment[] = useMemo(() => {
    if (pending.length === 0) return serverComments;
    const user = useAuthStore.getState().user;
    return [...pending.map((entry) => toComment(entry, user)), ...serverComments];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, data]);

  return {
    comments,
    isLoading,
    isFetchingMore: isFetchingNextPage,
    hasMore: hasNextPage ?? false,
    loadMore: fetchNextPage,
    refresh: refetch,
    addComment,
    retryComment,
    discardComment,
    isAddingComment: pending.some((c) => c.status === 'sending'),
  };
}

/** A pending comment in the shape the list draws. */
function toComment(
  entry: PendingComment,
  user: {
    id: string | number;
    username: string;
    displayName?: string;
    avatar?: string | null;
    role?: Role;
  } | null
): Comment {
  return {
    id: entry.id,
    userId: user ? String(user.id) : '',
    contentId: entry.postId,
    comment: entry.text,
    parentId: entry.parentId,
    createdAt: entry.createdAt,
    status: entry.status,
    author: user
      ? {
          id: String(user.id),
          username: user.username,
          displayName: user.displayName || user.username,
          avatar: user.avatar || null,
          role: user.role,
        }
      : undefined,
    replies: [],
  };
}
