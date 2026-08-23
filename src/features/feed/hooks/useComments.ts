import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { feedService } from '../services/feedService';
import {
  cancelPostQueries,
  snapshotPostCaches,
  rollbackPostCaches,
  patchPostInCaches,
  findPostInCaches,
} from '../utils/postCacheSync';
import {
  reportSocialAction,
  reportSocialActionFailed,
  reportCounterDivergence,
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

  const addCommentMutation = useMutation({
    mutationFn: ({ text, parentId }: { text: string; parentId?: string }) =>
      feedService.addComment(postId, text, parentId),
    onMutate: async ({ text, parentId }) => {
      await cancelPostQueries(queryClient, postId);
      const snapshot = snapshotPostCaches(queryClient, postId);

      // Optimistically increment comment count
      patchPostInCaches(queryClient, postId, (post) => ({
        ...post,
        commentsCount: (post.commentsCount || 0) + 1,
      }));

      // Snapshot comments cache
      const prevComments = queryClient.getQueryData(QUERY_KEYS.FEED.COMMENTS(postId));

      // Build optimistic comment
      const user = useAuthStore.getState().user;
      const optimisticComment: Comment = {
        id: `temp-${Date.now()}`,
        userId: user ? String(user.id) : '',
        contentId: postId,
        comment: text,
        parentId: parentId ?? null,
        createdAt: new Date().toISOString(),
        author: user
          ? {
              id: String(user.id),
              username: user.username,
              displayName: user.displayName || user.username,
              avatar: user.avatar || null,
            }
          : undefined,
        replies: [],
      };

      // Inject at the beginning of the first page
      queryClient.setQueryData(QUERY_KEYS.FEED.COMMENTS(postId), (old: any) => {
        if (!old?.pages?.length) {
          return {
            pages: [
              {
                data: [optimisticComment],
                meta: { pagination: { page: 1, totalPages: 1 } },
              },
            ],
            pageParams: [1],
          };
        }
        return {
          ...old,
          pages: old.pages.map((page: any, i: number) =>
            i === 0 ? { ...page, data: [optimisticComment, ...(page.data ?? [])] } : page
          ),
        };
      });

      return { snapshot, prevComments };
    },
    onError: (_err, {}, context) => {
      reportSocialActionFailed('comment_create', postId, _err);
      if (context?.snapshot) {
        rollbackPostCaches(queryClient, postId, context.snapshot);
      }
      if (context?.prevComments !== undefined) {
        queryClient.setQueryData(QUERY_KEYS.FEED.COMMENTS(postId), context.prevComments);
      }
    },
    onSuccess: async () => {
      // Replace optimistic comment with real server data
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.FEED.COMMENTS(postId) });

      // RECONCILE THE BADGE with the server's authoritative count. The
      // optimistic +1 above is applied to whatever the cached post object held,
      // and that can be OLDER than the comment list: David opened a post the
      // instant its push arrived (count 0), someone else commented, then he
      // commented — his badge showed 0+1=1 while the refetched list showed 2
      // (Aug 23; verified against the DB: 3 real comments, Redis 3, badge 1).
      // Invalidating only the comment list never corrected that. We patch ONLY
      // the count on the already-cached post objects: no feed invalidation, so
      // nothing refetches, reorders or flickers. A failure keeps the optimistic
      // value, exactly as before.
      try {
        // NOTE: feedService.getPost returns the RAW API shape (it does not run
        // the feed mapper), so the count lives under `interactions`. Read both
        // shapes — otherwise this whole reconciliation is a silent no-op, which
        // is exactly how it was written the first time.
        const fresh = (await feedService.getPost(postId)) as unknown as {
          commentsCount?: number;
          interactions?: { commentsCount?: number };
        };
        const serverCount = fresh?.interactions?.commentsCount ?? fresh?.commentsCount;
        if (typeof serverCount === 'number') {
          // What the user is CURRENTLY seeing, read before we correct it. If it
          // disagrees with the server we emit the divergence — the alarm that
          // would have surfaced this whole class of bug without a human noticing.
          const shown = findPostInCaches(queryClient, postId)?.commentsCount;
          reportCounterDivergence({
            action: 'comment_create',
            targetId: postId,
            field: 'commentsCount',
            shown,
            server: serverCount,
          });
          patchPostInCaches(queryClient, postId, (post) => ({
            ...post,
            commentsCount: serverCount,
          }));
        }
      } catch {
        // Best-effort reconciliation; the optimistic count stands.
      }
      reportSocialAction('comment_create', postId, 'applied');
    },
  });

  const comments: Comment[] = data?.pages.flatMap((page: any) => page.data ?? []) ?? [];

  return {
    comments,
    isLoading,
    isFetchingMore: isFetchingNextPage,
    hasMore: hasNextPage ?? false,
    loadMore: fetchNextPage,
    refresh: refetch,
    addComment: (text: string, parentId?: string) =>
      addCommentMutation.mutateAsync({ text, parentId }),
    isAddingComment: addCommentMutation.isPending,
  };
}
