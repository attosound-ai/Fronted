import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { feedService } from '../services/feedService';
import { useAuthStore } from '@/stores/authStore';
import type { Post } from '@/types';

/**
 * useReelsFeed — TikTok-style FYP feed using the /posts/reels endpoint.
 * Shares the same like/bookmark mutation pattern as useFeed.
 */
export function useReelsFeed() {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isRefetching,
    refetch,
  } = useInfiniteQuery({
    queryKey: QUERY_KEYS.FEED.REELS,
    queryFn: ({ pageParam }) => feedService.getReelsFeed(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    enabled: isAuthenticated,
  });

  const likeMutation = useMutation({
    mutationFn: async ({ postId, isLiked }: { postId: string; isLiked: boolean }) => {
      if (isLiked) {
        await feedService.unlikePost(postId);
      } else {
        await feedService.likePost(postId);
      }
    },
    onMutate: async ({ postId, isLiked }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.FEED.REELS });
      const previousData = queryClient.getQueryData(QUERY_KEYS.FEED.REELS);
      queryClient.setQueryData(QUERY_KEYS.FEED.REELS, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            data: page.data.map((p: Post) =>
              p.id === postId
                ? { ...p, isLiked: !isLiked, likesCount: isLiked ? p.likesCount - 1 : p.likesCount + 1 }
                : p
            ),
          })),
        };
      });
      return { previousData };
    },
    onError: (_, __, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(QUERY_KEYS.FEED.REELS, context.previousData);
      }
    },
  });

  const bookmarkMutation = useMutation({
    mutationFn: async ({ postId, isBookmarked }: { postId: string; isBookmarked: boolean }) => {
      if (isBookmarked) {
        await feedService.unbookmarkPost(postId);
      } else {
        await feedService.bookmarkPost(postId);
      }
    },
    onMutate: async ({ postId, isBookmarked }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.FEED.REELS });
      const previousData = queryClient.getQueryData(QUERY_KEYS.FEED.REELS);
      queryClient.setQueryData(QUERY_KEYS.FEED.REELS, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            data: page.data.map((p: Post) =>
              p.id === postId ? { ...p, isBookmarked: !isBookmarked } : p
            ),
          })),
        };
      });
      return { previousData };
    },
    onError: (_, __, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(QUERY_KEYS.FEED.REELS, context.previousData);
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
    refresh: refetch,
    loadMore: fetchNextPage,
    toggleLike: (postId: string) => {
      const pages = queryClient.getQueryData(QUERY_KEYS.FEED.REELS) as any;
      const post = pages?.pages?.flatMap((p: any) => p.data)?.find((p: Post) => p.id === postId);
      likeMutation.mutate({ postId, isLiked: post?.isLiked ?? false });
    },
    toggleBookmark: (postId: string) => {
      const pages = queryClient.getQueryData(QUERY_KEYS.FEED.REELS) as any;
      const post = pages?.pages?.flatMap((p: any) => p.data)?.find((p: Post) => p.id === postId);
      bookmarkMutation.mutate({ postId, isBookmarked: post?.isBookmarked ?? false });
    },
  };
}
