import { useMutation, useQueryClient } from '@tanstack/react-query';
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
                p.id === postId
                  ? { ...p, content: textContent, textContent }
                  : p,
              ),
            })),
          };
        });
      }

      return { prevFeed };
    },

    onError: (_err, _vars, context) => {
      if (context?.prevFeed) {
        queryClient.setQueryData(QUERY_KEYS.FEED.INFINITE(userId), context.prevFeed);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.FEED.INFINITE(userId) });
      if (userId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.FEED.USER_POSTS(userId) });
      }
    },

    onSuccess: (_data, variables) => {
      analytics.capture(ANALYTICS_EVENTS.FEED.POST_CREATED, {
        action: 'edited',
        post_id: variables.postId,
      });
    },
  });

  return {
    editPost: mutation.mutate,
    isEditing: mutation.isPending,
    error: mutation.error,
  };
}
