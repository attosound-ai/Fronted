import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import type { CreatorLogo } from './useCreatorLogos';

interface VoteParams {
  logoId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  currentRating: number | null;
}

export function useLogoVote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ logoId, rating }: VoteParams) =>
      apiClient.post(API_ENDPOINTS.CREATOR_LOGOS.VOTE(logoId), { rating }),

    onMutate: async ({ logoId, rating, currentRating }) => {
      await queryClient.cancelQueries({ queryKey: ['creator-logos'] });
      const prev = queryClient.getQueryData<CreatorLogo[]>(['creator-logos']);

      queryClient.setQueryData<CreatorLogo[]>(['creator-logos'], (old) =>
        old?.map((logo) => {
          if (logo.id !== logoId) return logo;

          const isNewVote = currentRating === null;
          const newCount = isNewVote ? logo.ratingCount + 1 : logo.ratingCount;
          const oldSum = logo.rating * logo.ratingCount;
          const newSum = oldSum - (currentRating ?? 0) + rating;

          return {
            ...logo,
            userRating: rating,
            ratingCount: newCount,
            rating: newCount > 0 ? newSum / newCount : 0,
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
