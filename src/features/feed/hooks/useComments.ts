import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { feedService } from '../services/feedService';
import {
  cancelPostQueries,
  snapshotPostCaches,
  rollbackPostCaches,
  patchPostInCaches,
} from '../utils/postCacheSync';
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
      if (context?.snapshot) {
        rollbackPostCaches(queryClient, postId, context.snapshot);
      }
      if (context?.prevComments !== undefined) {
        queryClient.setQueryData(QUERY_KEYS.FEED.COMMENTS(postId), context.prevComments);
      }
    },
    onSuccess: () => {
      // Replace optimistic comment with real server data
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.FEED.COMMENTS(postId) });
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
