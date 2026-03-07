import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { messageService } from '../services/messageService';
import { useChatStore } from '../stores/chatStore';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import type { ChatConversation } from '../types';

export function useConversations() {
  const queryClient = useQueryClient();
  const setTotalUnread = useChatStore((s) => s.setTotalUnread);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  useEffect(() => {
    analytics.capture(ANALYTICS_EVENTS.MESSAGES.CONVERSATIONS_VIEWED);
  }, []);

  const { data, isLoading, refetch, error } = useQuery({
    queryKey: QUERY_KEYS.MESSAGES.CONVERSATIONS,
    queryFn: () => messageService.getConversations(),
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 10,
    retry: 2,
  });

  // Sync total unread count to Zustand so the tab badge can read it
  useEffect(() => {
    if (data) {
      const total = data.reduce((sum, c) => sum + c.unreadCount, 0);
      setTotalUnread(total);
    }
  }, [data, setTotalUnread]);

  const manualRefresh = useCallback(async () => {
    setIsManualRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsManualRefreshing(false);
    }
  }, [refetch]);

  return {
    conversations: (data ?? []) as ChatConversation[],
    isLoading,
    isRefreshing: isManualRefreshing,
    error: error as Error | null,
    refresh: manualRefresh,
    invalidate: () =>
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.MESSAGES.CONVERSATIONS,
      }),
  };
}
