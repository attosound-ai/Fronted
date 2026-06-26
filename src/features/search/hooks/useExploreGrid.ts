import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { feedService } from '@/features/feed/services/feedService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { Post } from '@/types';

export function useExploreGrid() {
  const query = useInfiniteQuery({
    queryKey: QUERY_KEYS.FEED.EXPLORE,
    queryFn: ({ pageParam }) =>
      feedService.getExploreFeed(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 1000 * 60 * 2, // 2 min
  });

  // Dedupe by id: cursor pages can overlap (or the backend can repeat a post),
  // which would give FlatList duplicate keys and crash the grid. Keep first seen.
  const posts: Post[] = useMemo(() => {
    const seen = new Set<string>();
    return (query.data?.pages.flatMap((p) => p.data) ?? []).filter((post) => {
      if (seen.has(post.id)) return false;
      seen.add(post.id);
      return true;
    });
  }, [query.data?.pages]);

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
