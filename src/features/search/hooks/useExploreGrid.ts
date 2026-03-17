import { useInfiniteQuery } from '@tanstack/react-query';
import { feedService } from '@/features/feed/services/feedService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { Post } from '@/types';

export function useExploreGrid() {
  const query = useInfiniteQuery({
    queryKey: QUERY_KEYS.FEED.EXPLORE,
    queryFn: ({ pageParam }) => feedService.getExploreFeed(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 1000 * 60 * 2, // 2 min
  });

  const posts: Post[] = query.data?.pages.flatMap((p) => p.data) ?? [];

  return {
    posts,
    isLoading: query.isLoading,
    isFetchingMore: query.isFetchingNextPage,
    hasMore: query.hasNextPage,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
    },
    refresh: () => query.refetch(),
  };
}
