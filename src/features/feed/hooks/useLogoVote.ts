import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import type { CreatorLogo } from './useCreatorLogos';

interface VoteParams {
  logoId: string;
  vote: 1 | -1;
  currentVote: number | null;
}

export function useLogoVote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ logoId, vote, currentVote }: VoteParams) => {
      // Toggle off: same vote again → remove
      if (currentVote === vote) {
        return apiClient.delete(API_ENDPOINTS.CREATOR_LOGOS.VOTE(logoId));
      }
      // New vote or change vote
      return apiClient.post(API_ENDPOINTS.CREATOR_LOGOS.VOTE(logoId), { vote });
    },

    onMutate: async ({ logoId, vote, currentVote }) => {
      await queryClient.cancelQueries({ queryKey: ['creator-logos'] });
      const prev = queryClient.getQueryData<CreatorLogo[]>(['creator-logos']);
      const isToggleOff = currentVote === vote;

      queryClient.setQueryData<CreatorLogo[]>(['creator-logos'], (old) =>
        old?.map((logo) => {
          if (logo.id !== logoId) return logo;
          if (isToggleOff) {
            return {
              ...logo,
              userVote: null,
              likes: logo.likes + (vote === 1 ? -1 : 0),
              dislikes: logo.dislikes + (vote === -1 ? -1 : 0),
            };
          }
          return {
            ...logo,
            userVote: vote,
            likes: logo.likes + (vote === 1 ? 1 : 0) + (currentVote === 1 ? -1 : 0),
            dislikes:
              logo.dislikes + (vote === -1 ? 1 : 0) + (currentVote === -1 ? -1 : 0),
          };
        })
      );

      return { prev };
    },

    onError: (_, __, context) => {
      if (context?.prev) {
        queryClient.setQueryData(['creator-logos'], context.prev);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['creator-logos'] });
    },
  });
}
