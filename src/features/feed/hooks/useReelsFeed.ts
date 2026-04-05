import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { feedService } from '../services/feedService';
import { useAuthStore } from '@/stores/authStore';

/**
 * useReelsFeed — TikTok-style FYP feed using the /posts/reels endpoint.
 * Interaction mutations are now centralised in useInteractions.
 */
export function useReelsFeed() {
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
  } = useInfiniteQuery({
    queryKey: QUERY_KEYS.FEED.REELS(currentUserId),
    queryFn: ({ pageParam }) => feedService.getReelsFeed(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const posts = data?.pages.flatMap((page) => page.data) ?? [];

  return {
    posts,
    isLoading,
    isRefreshing: isRefetching,
    isFetchingMore: isFetchingNextPage,
    hasMore: hasNextPage ?? false,
    refresh: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.FEED.REELS(currentUserId) });
      return refetch();
    },
    loadMore: fetchNextPage,
  };
}
