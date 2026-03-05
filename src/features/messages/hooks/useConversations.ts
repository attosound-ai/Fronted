import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { messageService } from '../services/messageService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import type { ChatConversation } from '../types';

export function useConversations() {
  const queryClient = useQueryClient();

  useEffect(() => {
    analytics.capture(ANALYTICS_EVENTS.MESSAGES.CONVERSATIONS_VIEWED);
  }, []);

  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: QUERY_KEYS.MESSAGES.CONVERSATIONS,
    queryFn: () => messageService.getConversations(),
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 10,
    retry: 2,
  });

  return {
    conversations: (data ?? []) as ChatConversation[],
    isLoading,
    isRefreshing: isRefetching,
    error: error as Error | null,
    refresh: refetch,
    invalidate: () =>
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.MESSAGES.CONVERSATIONS,
      }),
  };
}
