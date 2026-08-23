import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { feedService } from '../services/feedService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import {
  reportSocialAction,
  reportSocialActionFailed,
} from '@/lib/analytics/socialTelemetry';
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
        { post_id: postId }
      );
      await cancelPostQueries(queryClient, postId);
      const snapshot = snapshotPostCaches(queryClient, postId);
      patchPostInCaches(queryClient, postId, (post) => ({
        ...post,
        isLiked: !wasLiked,
        likesCount: wasLiked ? Math.max(0, post.likesCount - 1) : post.likesCount + 1,
      }));
      return { snapshot };
    },
    onError: (error, { postId, wasLiked }, context) => {
      if (context?.snapshot) {
        rollbackPostCaches(queryClient, postId, context.snapshot);
      }
      // Until now this rollback was SILENT while onMutate had already reported
      // feed_post_liked — telemetry claimed the opposite of what the user saw.
      reportSocialActionFailed(wasLiked ? 'unlike' : 'like', postId, error);
    },
    onSuccess: (_data, { postId, wasLiked }) => {
      reportSocialAction(wasLiked ? 'unlike' : 'like', postId, 'applied');
    },
  });

  // ── Bookmark ──────────────────────────────────────────────────────────────

  const bookmarkMutation = useMutation({
    mutationFn: async ({
      postId,
      wasBookmarked,
    }: {
      postId: string;
      wasBookmarked: boolean;
    }) => {
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
    onError: (error, { postId, wasBookmarked }, context) => {
      if (context?.snapshot) {
        rollbackPostCaches(queryClient, postId, context.snapshot);
      }
      reportSocialActionFailed(wasBookmarked ? 'unbookmark' : 'bookmark', postId, error);
    },
    onSuccess: (_data, { postId, wasBookmarked }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.FEED.BOOKMARKS });
      reportSocialAction(wasBookmarked ? 'unbookmark' : 'bookmark', postId, 'applied');
    },
  });

  // ── Repost ────────────────────────────────────────────────────────────────

  const repostMutation = useMutation({
    mutationFn: async ({
      postId,
      wasReposted,
    }: {
      postId: string;
      wasReposted: boolean;
    }) => {
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
    onError: (error, { postId, wasReposted }, context) => {
      if (context?.snapshot) {
        rollbackPostCaches(queryClient, postId, context.snapshot);
      }
      reportSocialActionFailed(wasReposted ? 'unrepost' : 'repost', postId, error);
    },
    onSuccess: (_data, { postId, wasReposted }) => {
      reportSocialAction(wasReposted ? 'unrepost' : 'repost', postId, 'applied');
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
    // Fire-and-forget by design (no rollback), which made a failing share
    // completely invisible: the count went up locally and stayed up.
    onError: (error, postId) => {
      reportSocialActionFailed('share', postId, error);
    },
    onSuccess: (_data, postId) => {
      reportSocialAction('share', postId, 'applied');
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
