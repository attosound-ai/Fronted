/**
 * usePostFeed — source-aware feed hook for the post detail screen.
 *
 * Instagram/TikTok-style behavior: when a post is opened from a grid or a
 * search result, the detail screen continues as an infinite list of the
 * surrounding posts from the same source. The initial post is always at
 * position 0; scrolling down pulls in the next posts from that source.
 *
 * Supported sources:
 *   - `profile`      — uses feedService.getUserPosts(userId) infinite query
 *   - `search`       — uses useContentSearch(query) single-page results
 *   - `bookmarks`    — uses feedService.getBookmarks paginated list
 *   - `feed`         — uses the main home feed (posts already in cache)
 *   - `single`       — fallback; only the single requested post (no scroll)
 */

import { useMemo, useCallback, useEffect } from 'react';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { QUERY_KEYS } from '@/constants/queryKeys';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { feedService } from '../services/feedService';
import type { Post } from '@/types';
import type { FeedResponse } from '../types';

export type PostFeedSource = 'profile' | 'search' | 'bookmarks' | 'feed' | 'single';

interface UsePostFeedArgs {
  initialPostId: string;
  source: PostFeedSource;
  sourceUserId?: number;
  sourceQuery?: string;
  sourceContentType?: string;
}

interface UsePostFeedResult {
  posts: Post[];
  isLoading: boolean;
  isFetchingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => void;
  isRefreshing: boolean;
}

/** Raw search endpoint — the existing hook caches by query; we reuse that cache here. */
interface ContentSearchResult {
  id: string;
  authorId: string;
  contentType: string;
  textContent?: string;
  filePaths: string[];
  metadata: Record<string, string>;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

function mapSearchResult(raw: ContentSearchResult): Post {
  return {
    id: raw.id,
    content: raw.textContent ?? '',
    images: raw.contentType === 'image' ? raw.filePaths : [],
    author: {
      id: 0,
      username: '',
      displayName: '',
      avatar: null,
      role: 'listener',
    },
    likesCount: 0,
    commentsCount: 0,
    isLiked: false,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    contentType: raw.contentType,
    textContent: raw.textContent,
    filePaths: raw.filePaths,
    metadata: raw.metadata,
    tags: raw.tags,
  };
}

/**
 * Reorder a post list so `initialPostId` is at position 0, followed by the
 * posts that appeared after it in source order. Posts before it are appended
 * at the end so the user can still reach them by scrolling far enough —
 * matches Instagram's behavior where the tapped post opens in place.
 *
 * If the initial post isn't present in the source list (e.g. the user
 * deep-linked, or the source feed doesn't contain that post), prepend it
 * from `fallback` so the screen still opens on the right post.
 */
function reorderFromInitial<T extends { id: string }>(
  posts: T[],
  initialPostId: string,
  fallback?: T | null
): T[] {
  const idx = posts.findIndex((p) => p.id === initialPostId);
  if (idx === -1) {
    return fallback ? [fallback, ...posts] : posts;
  }
  if (idx === 0) return posts;
  return [...posts.slice(idx), ...posts.slice(0, idx)];
}

export function usePostFeed({
  initialPostId,
  source,
  sourceUserId,
  sourceQuery,
  sourceContentType,
}: UsePostFeedArgs): UsePostFeedResult {
  const queryClient = useQueryClient();

  // Fallback: always fetch the single post so we can show it immediately,
  // even if the source feed hasn't loaded it yet. Once the source feed
  // arrives with the post in it, we prefer the source copy (same fields).
  const singlePostQuery = useQuery({
    queryKey: QUERY_KEYS.FEED.POST(initialPostId),
    queryFn: () => feedService.getPost(initialPostId),
    enabled: !!initialPostId,
    staleTime: 1000 * 60,
  });

  // ── source: profile ─────────────────────────────────────────────────────
  const profileQuery = useInfiniteQuery<FeedResponse>({
    queryKey: sourceUserId
      ? QUERY_KEYS.FEED.USER_POSTS(sourceUserId)
      : ['post-feed', 'profile', 'disabled'],
    queryFn: ({ pageParam }) =>
      feedService.getUserPosts(sourceUserId!, pageParam as string | undefined),
    initialPageParam: undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined),
    enabled: source === 'profile' && !!sourceUserId,
  });

  // ── source: bookmarks ───────────────────────────────────────────────────
  const bookmarksQuery = useInfiniteQuery({
    queryKey: QUERY_KEYS.FEED.BOOKMARKS,
    queryFn: async ({ pageParam }) => {
      const page = typeof pageParam === 'number' ? pageParam : 1;
      const raw = await feedService.getBookmarks(page, 20);
      const contentIds: string[] = raw.data ?? [];
      const totalPages = raw.meta?.pagination?.totalPages ?? 1;
      const posts = await Promise.all(
        contentIds.map((id) => feedService.getPost(id).catch(() => null))
      );
      return {
        posts: posts.filter((p): p is Post => p !== null),
        page,
        totalPages,
        hasMore: page < totalPages,
      };
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    enabled: source === 'bookmarks',
  });

  // ── source: feed (main home feed) ───────────────────────────────────────
  const feedQuery = useInfiniteQuery<FeedResponse>({
    queryKey: QUERY_KEYS.FEED.INFINITE(),
    queryFn: ({ pageParam }) => feedService.getFeed(pageParam as string | undefined),
    initialPageParam: undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined),
    enabled: source === 'feed',
  });

  // ── source: search ──────────────────────────────────────────────────────
  // Search has no backend pagination right now, so this is a single-shot
  // query that returns up to 30 results. We reuse the same queryKey as
  // useContentSearch so the page hits cache instantly when the user taps
  // a cell from the search screen.
  const searchQuery = useQuery<Post[]>({
    queryKey: QUERY_KEYS.FEED.SEARCH((sourceQuery ?? '') + (sourceContentType ?? '')),
    queryFn: async () => {
      if (!sourceQuery?.trim()) return [];
      const res = await apiClient.get(API_ENDPOINTS.POSTS.SEARCH, {
        params: { q: sourceQuery, content_type: sourceContentType, limit: 30 },
      });
      const raw: ContentSearchResult[] = res.data?.data ?? [];
      return raw.map(mapSearchResult);
    },
    enabled: source === 'search' && !!sourceQuery?.trim(),
    staleTime: 1000 * 30,
  });

  // ── unified derivation ──────────────────────────────────────────────────
  const { posts, isLoading, isFetchingMore, hasMore, loadMore, refresh, isRefreshing } =
    useMemo(() => {
      const single = singlePostQuery.data ? [singlePostQuery.data] : [];

      if (source === 'profile') {
        const list = profileQuery.data?.pages.flatMap((p) => p.data) ?? [];
        return {
          posts: reorderFromInitial(list, initialPostId, singlePostQuery.data ?? null),
          isLoading: profileQuery.isLoading && list.length === 0,
          isFetchingMore: profileQuery.isFetchingNextPage,
          hasMore: profileQuery.hasNextPage ?? false,
          loadMore: () => profileQuery.fetchNextPage(),
          refresh: () => profileQuery.refetch(),
          isRefreshing: profileQuery.isRefetching,
        };
      }

      if (source === 'bookmarks') {
        const list = bookmarksQuery.data?.pages.flatMap((p) => p.posts) ?? [];
        return {
          posts: reorderFromInitial(list, initialPostId, singlePostQuery.data ?? null),
          isLoading: bookmarksQuery.isLoading && list.length === 0,
          isFetchingMore: bookmarksQuery.isFetchingNextPage,
          hasMore: bookmarksQuery.hasNextPage ?? false,
          loadMore: () => bookmarksQuery.fetchNextPage(),
          refresh: () => bookmarksQuery.refetch(),
          isRefreshing: bookmarksQuery.isRefetching,
        };
      }

      if (source === 'feed') {
        const list = feedQuery.data?.pages.flatMap((p) => p.data) ?? [];
        return {
          posts: reorderFromInitial(list, initialPostId, singlePostQuery.data ?? null),
          isLoading: feedQuery.isLoading && list.length === 0,
          isFetchingMore: feedQuery.isFetchingNextPage,
          hasMore: feedQuery.hasNextPage ?? false,
          loadMore: () => feedQuery.fetchNextPage(),
          refresh: () => feedQuery.refetch(),
          isRefreshing: feedQuery.isRefetching,
        };
      }

      if (source === 'search') {
        const list = searchQuery.data ?? [];
        return {
          posts: reorderFromInitial(list, initialPostId, singlePostQuery.data ?? null),
          isLoading: searchQuery.isLoading && list.length === 0,
          isFetchingMore: false,
          hasMore: false,
          loadMore: () => {},
          refresh: () => searchQuery.refetch(),
          isRefreshing: searchQuery.isRefetching,
        };
      }

      // `single` fallback
      return {
        posts: single,
        isLoading: singlePostQuery.isLoading,
        isFetchingMore: false,
        hasMore: false,
        loadMore: () => {},
        refresh: () => singlePostQuery.refetch(),
        isRefreshing: singlePostQuery.isRefetching,
      };
    }, [
      source,
      initialPostId,
      singlePostQuery.data,
      singlePostQuery.isLoading,
      singlePostQuery.isRefetching,
      profileQuery.data,
      profileQuery.isLoading,
      profileQuery.isFetchingNextPage,
      profileQuery.hasNextPage,
      profileQuery.isRefetching,
      bookmarksQuery.data,
      bookmarksQuery.isLoading,
      bookmarksQuery.isFetchingNextPage,
      bookmarksQuery.hasNextPage,
      bookmarksQuery.isRefetching,
      feedQuery.data,
      feedQuery.isLoading,
      feedQuery.isFetchingNextPage,
      feedQuery.hasNextPage,
      feedQuery.isRefetching,
      searchQuery.data,
      searchQuery.isLoading,
      searchQuery.isRefetching,
    ]);

  // Warm the individual post cache with hydrated copies from the source feed
  // so the detail screen, comments counts, etc. stay in sync across routes.
  useEffect(() => {
    for (const p of posts) {
      queryClient.setQueryData(QUERY_KEYS.FEED.POST(p.id), p);
    }
  }, [posts, queryClient]);

  const stableLoadMore = useCallback(() => {
    if (!isFetchingMore && hasMore) loadMore();
  }, [isFetchingMore, hasMore, loadMore]);

  return {
    posts,
    isLoading,
    isFetchingMore,
    hasMore,
    loadMore: stableLoadMore,
    refresh,
    isRefreshing,
  };
}
