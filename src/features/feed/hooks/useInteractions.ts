import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { feedService } from '../services/feedService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import {
  cancelPostQueries,
  snapshotPostCaches,
  rollbackPostCaches,
  patchPostInCaches,
  findPostInCaches,
} from '../utils/postCacheSync';
import type { Post } from '@/types';

/**
 * useInteractions — Centralised interaction mutations (like, bookmark, repost, share).
 *
 * Every mutation uses patchPostInCaches for optimistic updates across
 * INFINITE, REELS, BOOKMARKS, and POST(id) caches simultaneously.
 */
export function useInteractions() {
  const queryClient = useQueryClient();

  // ── Like ──────────────────────────────────────────────────────────────────

  const likeMutation = useMutation({
    mutationFn: async ({ postId, wasLiked }: { postId: string; wasLiked: boolean }) => {
      if (wasLiked) {
        await feedService.unlikePost(postId);
      } else {
        await feedService.likePost(postId);
      }
    },
    onMutate: async ({ postId, wasLiked }) => {
      analytics.capture(
        wasLiked ? ANALYTICS_EVENTS.FEED.POST_UNLIKED : ANALYTICS_EVENTS.FEED.POST_LIKED,
        { post_id: postId },
      );
      await cancelPostQueries(queryClient, postId);
      const snapshot = snapshotPostCaches(queryClient, postId);
      patchPostInCaches(queryClient, postId, (post) => ({
        ...post,
        isLiked: !wasLiked,
        likesCount: wasLiked
          ? Math.max(0, post.likesCount - 1)
          : post.likesCount + 1,
      }));
      return { snapshot };
    },
    onError: (_, { postId }, context) => {
      if (context?.snapshot) {
        rollbackPostCaches(queryClient, postId, context.snapshot);
      }
    },
  });

  // ── Bookmark ──────────────────────────────────────────────────────────────

  const bookmarkMutation = useMutation({
    mutationFn: async ({ postId, wasBookmarked }: { postId: string; wasBookmarked: boolean }) => {
      if (wasBookmarked) {
        await feedService.unbookmarkPost(postId);
      } else {
        await feedService.bookmarkPost(postId);
      }
    },
    onMutate: async ({ postId, wasBookmarked }) => {
      await cancelPostQueries(queryClient, postId);
      const snapshot = snapshotPostCaches(queryClient, postId);
      patchPostInCaches(queryClient, postId, (post) => ({
        ...post,
        isBookmarked: !wasBookmarked,
      }));
      return { snapshot };
    },
    onError: (_, { postId }, context) => {
      if (context?.snapshot) {
        rollbackPostCaches(queryClient, postId, context.snapshot);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.FEED.BOOKMARKS });
    },
  });

  // ── Repost ────────────────────────────────────────────────────────────────

  const repostMutation = useMutation({
    mutationFn: async ({ postId, wasReposted }: { postId: string; wasReposted: boolean }) => {
      if (wasReposted) {
        await feedService.unrepost(postId);
      } else {
        await feedService.repost(postId);
      }
    },
    onMutate: async ({ postId, wasReposted }) => {
      await cancelPostQueries(queryClient, postId);
      const snapshot = snapshotPostCaches(queryClient, postId);
      patchPostInCaches(queryClient, postId, (post) => ({
        ...post,
        isReposted: !wasReposted,
        repostsCount: wasReposted
          ? Math.max(0, (post.repostsCount ?? 1) - 1)
          : (post.repostsCount ?? 0) + 1,
      }));
      return { snapshot };
    },
    onError: (_, { postId }, context) => {
      if (context?.snapshot) {
        rollbackPostCaches(queryClient, postId, context.snapshot);
      }
    },
  });

  // ── Share (fire-and-forget, no rollback) ──────────────────────────────────

  const shareMutation = useMutation({
    mutationFn: (postId: string) => feedService.sharePost(postId),
    onMutate: (postId) => {
      patchPostInCaches(queryClient, postId, (post) => ({
        ...post,
        sharesCount: (post.sharesCount ?? 0) + 1,
      }));
    },
  });

  // ── Public API ────────────────────────────────────────────────────────────

  return {
    toggleLike: (postId: string) => {
      const post = findPostInCaches(queryClient, postId);
      likeMutation.mutate({ postId, wasLiked: post?.isLiked ?? false });
    },
    toggleBookmark: (postId: string) => {
      const post = findPostInCaches(queryClient, postId);
      bookmarkMutation.mutate({ postId, wasBookmarked: post?.isBookmarked ?? false });
    },
    toggleRepost: (postId: string) => {
      const post = findPostInCaches(queryClient, postId);
      repostMutation.mutate({ postId, wasReposted: post?.isReposted ?? false });
    },
    trackShare: (postId: string) => {
      shareMutation.mutate(postId);
    },
  };
}
