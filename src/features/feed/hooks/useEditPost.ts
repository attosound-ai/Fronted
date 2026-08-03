import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/react-native';
import { feedService } from '../services/feedService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import type { Post } from '@/types';

interface EditPostParams {
  postId: string;
  textContent?: string;
  tags?: string[];
}

export function useEditPost() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  const mutation = useMutation({
    mutationFn: ({ postId, textContent, tags }: EditPostParams) =>
      feedService.updatePost(postId, { textContent, tags }),

    onMutate: async ({ postId, textContent }) => {
      const queryKey = QUERY_KEYS.FEED.INFINITE(userId);
      await queryClient.cancelQueries({ queryKey });
      const prevFeed = queryClient.getQueryData(queryKey);

      if (textContent !== undefined) {
        queryClient.setQueryData(queryKey, (old: any) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page: any) => ({
              ...page,
              data: (page.data ?? []).map((p: Post) =>
                p.id === postId ? { ...p, content: textContent, textContent } : p
              ),
            })),
          };
        });
      }

      return { prevFeed };
    },

    onError: (err, _vars, context) => {
      if (context?.prevFeed) {
        queryClient.setQueryData(QUERY_KEYS.FEED.INFINITE(userId), context.prevFeed);
      }
      // Surface the failure — previously an edit that failed on the backend was
      // rolled back SILENTLY, so the user saw the post revert with no error and
      // thought "it saves but doesn't stick". Now it's visible in telemetry and the
      // caller (edit-post screen) awaits + alerts.
      analytics.capture(ANALYTICS_EVENTS.FEED.POST_EDIT_FAILED, {
        post_id: _vars.postId,
        error: err instanceof Error ? err.message : String(err),
      });
      Sentry.captureException(err, {
        tags: { feature: 'feed', step: 'edit-post' },
        extra: { post_id: _vars.postId },
      });
    },

    onSettled: (_data, _err, variables) => {
      // Profile grid only — a light backstop we don't authoritatively patch.
      // Deliberately NOT invalidating FEED.INFINITE or FEED.POST here anymore:
      // invalidate → refetch raced the backend's read-after-write, so the
      // single-post/reel viewer (which reads FEED.POST via reorderFromInitial)
      // showed the OLD text after "Done" until the user re-edited (David, Jul 26,
      // ATTO acct). onSuccess now writes the authoritative PUT response into those
      // caches directly, which is race-free; refetching them again would only
      // reintroduce the stale flash.
      if (userId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.FEED.USER_POSTS(userId) });
      }
    },

    onSuccess: (data, variables) => {
      // Write the AUTHORITATIVE updated post (the PUT response) straight into every
      // viewer cache — no refetch, no read-after-write race. FEED.POST is THE one
      // that was stale (the reel/detail viewer prioritises singlePostQuery.data).
      const hadSinglePostCache =
        queryClient.getQueryData(QUERY_KEYS.FEED.POST(variables.postId)) != null;
      queryClient.setQueryData(QUERY_KEYS.FEED.POST(variables.postId), data);
      queryClient.setQueryData(QUERY_KEYS.FEED.INFINITE(userId), (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            data: (page.data ?? []).map((p: Post) =>
              p.id === variables.postId ? data : p
            ),
          })),
        };
      });

      // Discriminator: did the backend actually return the new text? If not, the
      // bug is server-side (PUT didn't persist/return it); if yes, it was purely
      // the client cache (fixed above). Data, not guessing.
      const submitted = variables.textContent ?? '';
      const returned = data.textContent ?? data.content ?? '';
      analytics.capture(ANALYTICS_EVENTS.FEED.POST_EDITED, {
        post_id: variables.postId,
        submitted_len: submitted.length,
        returned_len: returned.length,
        returned_matches_submitted: submitted === returned,
        had_single_post_cache: hadSinglePostCache,
      });
    },
  });

  return {
    editPost: mutation.mutate,
    // Promise-returning variant so the edit screen can await the result and only
    // navigate back / dismiss on SUCCESS (rejects on backend failure).
    editPostAsync: mutation.mutateAsync,
    isEditing: mutation.isPending,
    error: mutation.error,
  };
}
