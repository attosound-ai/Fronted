import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { feedService } from '../services/feedService';

export interface CommentAuthor {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.FEED.COMMENTS(postId) });

      // Update comment count in both feed caches
      const increment = (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            data: page.data.map((post: any) =>
              post.id === postId
                ? { ...post, commentsCount: (post.commentsCount || 0) + 1 }
                : post
            ),
          })),
        };
      };
      queryClient.setQueryData(QUERY_KEYS.FEED.INFINITE, increment);
      queryClient.setQueryData(QUERY_KEYS.FEED.REELS, increment);
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
