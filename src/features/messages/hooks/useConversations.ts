import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { messageService } from '../services/messageService';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { useMountEffect } from '@/hooks';
import type { ChatConversation } from '../types';

export function useConversations() {
  const queryClient = useQueryClient();
  const setTotalUnread = useChatStore((s) => s.setTotalUnread);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  useMountEffect(() => {
    analytics.capture(ANALYTICS_EVENTS.MESSAGES.CONVERSATIONS_VIEWED);
  });

  const { data, isLoading, refetch, error } = useQuery({
    queryKey: QUERY_KEYS.MESSAGES.CONVERSATIONS(),
    queryFn: () => messageService.getConversations(),
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 10,
    retry: 2,
  });

  const totalUnread = useMemo(
    () => (data ? data.reduce((sum, c) => sum + c.unreadCount, 0) : 0),
    [data]
  );

  // Sync to Zustand for tab badge — intentional cross-store bridge
  useEffect(() => {
    setTotalUnread(totalUnread);
  }, [totalUnread, setTotalUnread]);

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
        queryKey: QUERY_KEYS.MESSAGES.CONVERSATIONS(),
      }),
  };
}
