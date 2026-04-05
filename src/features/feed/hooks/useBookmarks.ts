import { useInfiniteQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { feedService } from '../services/feedService';
import type { Post } from '@/types';

interface BookmarksApiResponse {
  success: boolean;
  data: string[];
  meta: {
    pagination: {
      page: number;
      total: number;
      totalPages: number;
    };
  };
}

interface BookmarksPage {
  posts: Post[];
  page: number;
  totalPages: number;
  hasMore: boolean;
}

/**
 * useBookmarks - Fetches the authenticated user's bookmarked posts.
 *
 * Strategy: fetch the paginated list of content IDs from /posts/bookmarks,
 * then resolve each ID into a full Post via feedService.getPost in parallel.
 */
export function useBookmarks() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isRefetching, refetch } =
    useInfiniteQuery<BookmarksPage>({
      queryKey: QUERY_KEYS.FEED.BOOKMARKS,
      queryFn: async ({ pageParam }) => {
        const page = typeof pageParam === 'number' ? pageParam : 1;
        const raw: BookmarksApiResponse = await feedService.getBookmarks(page, 20);

        const contentIds: string[] = raw.data ?? [];
        const totalPages = raw.meta?.pagination?.totalPages ?? 1;

        const posts = await Promise.all(
          contentIds.map((id) =>
            feedService.getPost(id).catch(() => null)
          )
        );

        return {
          posts: posts.filter((p): p is Post => p !== null),
          page,
          totalPages,
          hasMore: page < totalPages,
        };
      },
      initialPageParam: 1,
      getNextPageParam: (lastPage) =>
        lastPage.hasMore ? lastPage.page + 1 : undefined,
    });

  const bookmarks = data?.pages.flatMap((p) => p.posts) ?? [];

  return {
    bookmarks,
    isLoading,
    isRefreshing: isRefetching,
    refresh: refetch,
    loadMore: fetchNextPage,
    isFetchingMore: isFetchingNextPage,
    hasMore: hasNextPage ?? false,
  };
}
