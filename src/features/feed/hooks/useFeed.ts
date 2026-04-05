import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { QUERY_KEYS } from '@/constants/queryKeys';
import { feedService } from '../services/feedService';
import { useAuthStore } from '@/stores/authStore';
import {
  cancelPostQueries,
  snapshotPostCaches,
  rollbackPostCaches,
  removePostFromCaches,
} from '../utils/postCacheSync';

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
  const currentUserId = useAuthStore((s) => s.user?.id);

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
    queryKey: QUERY_KEYS.FEED.INFINITE(currentUserId),
    queryFn: ({ pageParam }) => feedService.getFeed(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    enabled: isAuthenticated,
    staleTime: 30_000, // 30s — social feed needs freshness
    refetchOnMount: 'always', // Always refetch when tab is focused (prevents stale persisted data)
  });

  const deleteMutation = useMutation({
    mutationFn: (postId: string) => feedService.deletePost(postId),
    onMutate: async (postId) => {
      await cancelPostQueries(queryClient, postId);
      const snapshot = snapshotPostCaches(queryClient, postId);
      removePostFromCaches(queryClient, postId);
      return { snapshot };
    },
    onError: (_, postId, context) => {
      if (context?.snapshot) {
        rollbackPostCaches(queryClient, postId, context.snapshot);
      }
    },
    onSuccess: (_, postId) => {
      if (currentUserId) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.FEED.USER_POSTS(Number(currentUserId)),
        });
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.USERS.PROFILE(Number(currentUserId)),
        });
      }
    },
  });

  const posts = data?.pages.flatMap((page) => page.data) ?? [];

  return {
    posts,
    isLoading,
    isRefreshing: isRefetching,
    isFetchingMore: isFetchingNextPage,
    hasMore: hasNextPage ?? false,
    error: error as Error | null,

    refresh: () => {
      // Invalidate cache first so refetch always hits the server,
      // even if data is still within staleTime window.
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.FEED.INFINITE(currentUserId) });
      // Keep profile posts grid in sync with the feed
      if (currentUserId) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.FEED.USER_POSTS(Number(currentUserId)),
        });
      }
      return refetch();
    },
    loadMore: fetchNextPage,
    deletePost: (postId: string) => deleteMutation.mutate(postId),
  };
}
