import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { feedService } from '../services/feedService';
import type { Post } from '@/types';

/**
 * useEngagement — bookmark and repost mutations with optimistic updates.
 *
 * IMPORTANT: mutationFn runs AFTER onMutate has already applied the optimistic
 * update to the cache, so we must NOT read the current state from the cache
 * inside mutationFn — it would already be toggled. Instead we pass the
 * original state as part of the mutation variables so both phases see the
 * same truth.
 */
export function useEngagement() {
  const queryClient = useQueryClient();

  const updatePost = (postId: string, updater: (post: Post) => Post) => {
    queryClient.setQueryData(QUERY_KEYS.FEED.INFINITE, (old: any) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page: any) => ({
          ...page,
          data: page.data.map((post: Post) =>
            post.id === postId ? updater(post) : post
          ),
        })),
      };
    });
  };

  const getPost = (postId: string): Post | undefined => {
    const pages = queryClient.getQueryData(QUERY_KEYS.FEED.INFINITE) as any;
    return pages?.pages?.flatMap((p: any) => p.data)?.find((p: Post) => p.id === postId);
  };

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
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.FEED.INFINITE });
      const previousData = queryClient.getQueryData(QUERY_KEYS.FEED.INFINITE);
      updatePost(postId, (post) => ({ ...post, isBookmarked: !wasBookmarked }));
      return { previousData };
    },
    onError: (_, __, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(QUERY_KEYS.FEED.INFINITE, context.previousData);
      }
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
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.FEED.INFINITE });
      const previousData = queryClient.getQueryData(QUERY_KEYS.FEED.INFINITE);
      updatePost(postId, (post) => ({
        ...post,
        isReposted: !wasReposted,
        repostsCount: wasReposted
          ? (post.repostsCount ?? 1) - 1
          : (post.repostsCount ?? 0) + 1,
      }));
      return { previousData };
    },
    onError: (_, __, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(QUERY_KEYS.FEED.INFINITE, context.previousData);
      }
    },
  });

  return {
    toggleBookmark: (postId: string) => {
      const post = getPost(postId);
      bookmarkMutation.mutate({ postId, wasBookmarked: post?.isBookmarked ?? false });
    },
    toggleRepost: (postId: string) => {
      const post = getPost(postId);
      repostMutation.mutate({ postId, wasReposted: post?.isReposted ?? false });
    },
  };
}
