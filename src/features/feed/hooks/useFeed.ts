import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { QUERY_KEYS } from '@/constants/queryKeys';
import { feedService } from '../services/feedService';
import { useAuthStore } from '@/stores/authStore';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import type { Post } from '@/types';

/**
 * useFeed - Hook para manejar el feed infinito
 *
 * Principio SOLID:
 * - Single Responsibility: Solo maneja estado del feed
 * - Dependency Inversion: Depende de abstracciones (feedService, queryClient)
 */
export function useFeed() {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Query infinita para el feed
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isRefetching,
    refetch,
    error,
  } = useInfiniteQuery({
    queryKey: QUERY_KEYS.FEED.INFINITE,
    queryFn: ({ pageParam }) => feedService.getFeed(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    enabled: isAuthenticated,
  });

  // Mutation para like
  const likeMutation = useMutation({
    mutationFn: (postId: string) => feedService.likePost(postId),
    onMutate: async (postId) => {
      // Track like/unlike
      const pages = queryClient.getQueryData(QUERY_KEYS.FEED.INFINITE) as any;
      const post = pages?.pages
        ?.flatMap((p: any) => p.data)
        ?.find((p: Post) => p.id === postId);
      analytics.capture(
        post?.isLiked
          ? ANALYTICS_EVENTS.FEED.POST_UNLIKED
          : ANALYTICS_EVENTS.FEED.POST_LIKED,
        { post_id: postId }
      );

      // Optimistic update
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.FEED.INFINITE });

      const previousData = queryClient.getQueryData(QUERY_KEYS.FEED.INFINITE);

      queryClient.setQueryData(QUERY_KEYS.FEED.INFINITE, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            data: page.data.map((post: Post) =>
              post.id === postId
                ? {
                    ...post,
                    isLiked: !post.isLiked,
                    likesCount: post.isLiked ? post.likesCount - 1 : post.likesCount + 1,
                  }
                : post
            ),
          })),
        };
      });

      return { previousData };
    },
    onError: (_, __, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(QUERY_KEYS.FEED.INFINITE, context.previousData);
      }
    },
  });

  // Aplanar los posts de todas las páginas
  const posts = data?.pages.flatMap((page) => page.data) ?? [];

  return {
    posts,
    isLoading,
    isRefreshing: isRefetching,
    isFetchingMore: isFetchingNextPage,
    hasMore: hasNextPage ?? false,
    error: error as Error | null,

    // Actions
    refresh: refetch,
    loadMore: fetchNextPage,
    toggleLike: (postId: string) => likeMutation.mutate(postId),
  };
}
