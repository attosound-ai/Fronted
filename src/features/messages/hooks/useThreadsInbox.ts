import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { threadInboxService } from '../services/threadInboxService';
import { useThreadFollowStore } from '../stores/threadFollowStore';
import { useThreadSeenStore } from '../stores/threadSeenStore';
import type { InboxThread } from '../types';

/**
 * Slack's "Threads": every thread you take part in, wherever it lives,
 * newest reply first. The server owns the unread count and the follow flag;
 * the two device stores stay as the instant layer, so a tap reads as done
 * before the request comes back and the chat list can mark a thread without
 * waiting for the inbox.
 */
export function useThreadsInbox() {
  const queryClient = useQueryClient();
  const key = QUERY_KEYS.MESSAGES.THREADS();
  const markSeenLocal = useThreadSeenStore((s) => s.markSeen);
  const setFollowingLocal = useThreadFollowStore((s) => s.setFollowing);

  const query = useQuery<InboxThread[]>({
    queryKey: key,
    queryFn: () => threadInboxService.list(),
    staleTime: 20_000,
  });

  const threads = useMemo(() => query.data ?? [], [query.data]);
  const unreadTotal = useMemo(
    () => threads.reduce((sum, t) => sum + (t.following ? t.unread : 0), 0),
    [threads]
  );

  const patch = useCallback(
    (threadId: string, change: Partial<InboxThread>) => {
      queryClient.setQueryData<InboxThread[]>(key, (old) =>
        (old ?? []).map((t) => (t.threadId === threadId ? { ...t, ...change } : t))
      );
    },
    [queryClient, key]
  );

  const readMutation = useMutation({
    mutationFn: ({
      conversationId,
      threadId,
    }: {
      conversationId: string;
      threadId: string;
    }) => threadInboxService.markRead(conversationId, threadId),
  });

  const followMutation = useMutation({
    mutationFn: ({
      conversationId,
      threadId,
      following,
    }: {
      conversationId: string;
      threadId: string;
      following: boolean;
    }) => threadInboxService.setFollowing(conversationId, threadId, following),
  });

  /** The thread was opened: its replies are seen, here and on the server. */
  const markRead = useCallback(
    (conversationId: string, threadId: string) => {
      markSeenLocal(threadId, Date.now());
      patch(threadId, { unread: 0 });
      readMutation.mutate({ conversationId, threadId });
    },
    [markSeenLocal, patch, readMutation]
  );

  const setFollowing = useCallback(
    (conversationId: string, threadId: string, following: boolean) => {
      setFollowingLocal(threadId, following);
      patch(threadId, { following, ...(following ? null : { unread: 0 }) });
      followMutation.mutate({ conversationId, threadId, following });
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.THREAD_FOLLOW_TOGGLED, {
        conversation_id: conversationId,
        thread_id: threadId,
        following,
        source: 'inbox',
      });
    },
    [setFollowingLocal, patch, followMutation]
  );

  return {
    threads,
    unreadTotal,
    isLoading: query.isLoading,
    isRefreshing: query.isRefetching,
    error: (query.error as Error | null) ?? null,
    refresh: query.refetch,
    markRead,
    setFollowing,
  };
}
