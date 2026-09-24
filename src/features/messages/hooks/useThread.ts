import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { apiClient } from '@/lib/api/client';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { messageService } from '../services/messageService';
import type {
  BackendMessage,
  ChatMessage,
  ChatMessagesPage,
  MessageMetadata,
} from '../types';

/**
 * A Slack style thread: the root message plus every reply sent with its id.
 * Replies also arrive on the conversation channel (they carry `thread_id`),
 * so the thread list watches the conversation cache for new ones and merges
 * them without another fetch.
 */
export function useThread(conversationId: string, threadId: string) {
  const queryClient = useQueryClient();
  const key = useMemo(
    () => [...QUERY_KEYS.MESSAGES.CHAT(conversationId), 'thread', threadId],
    [conversationId, threadId]
  );

  const query = useQuery<ChatMessage[]>({
    queryKey: key,
    queryFn: async () => {
      const res = await apiClient.get<{
        success: boolean;
        data: { messages: BackendMessage[] };
      }>(`/messages/${conversationId}/threads/${threadId}`);
      const list = (res.data.data?.messages ?? []).map(messageService.mapBackendMessage);
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.THREAD_OPENED, {
        conversation_id: conversationId,
        thread_id: threadId,
        reply_count: Math.max(0, list.length - 1),
      });
      return list;
    },
    staleTime: 15_000,
  });

  // Replies that landed in the conversation cache (channel or optimistic):
  // observed reactively, without fetching, so a reply shows up here at once.
  const conversationKey = QUERY_KEYS.MESSAGES.CHAT(conversationId);
  const { data: conversationPages } = useQuery<{ pages: ChatMessagesPage[] }>({
    queryKey: conversationKey,
    // Never fetches from here: the chat screen owns that query. The queryFn
    // only satisfies React Query and hands back whatever is cached.
    queryFn: () =>
      queryClient.getQueryData<{ pages: ChatMessagesPage[] }>(conversationKey) ?? {
        pages: [],
      },
    enabled: false,
  });
  const cachedReplies = useMemo(
    () =>
      (conversationPages?.pages ?? [])
        .flatMap((p) => p.messages)
        .filter((m) => m.threadId === threadId),
    [conversationPages, threadId]
  );

  const messages = useMemo(() => {
    const byId = new Map<string, ChatMessage>();
    for (const m of query.data ?? []) byId.set(m.messageId, m);
    // The conversation cache is where live updates land (reactions, edits,
    // deletes, realtime arrivals), so its copy wins over the fetched one;
    // the fetch is what supplies replies older than the loaded pages.
    for (const m of cachedReplies) byId.set(m.messageId, m);
    return [...byId.values()].sort(
      (a, b) => Date.parse(a.createdAt ?? '') - Date.parse(b.createdAt ?? '')
    );
  }, [query.data, cachedReplies]);

  // The message that started the thread also lives in the conversation, where
  // its reactions and edits are kept up to date.
  const cachedRoot = useMemo(
    () =>
      (conversationPages?.pages ?? [])
        .flatMap((p) => p.messages)
        .find((m) => m.messageId === threadId) ?? null,
    [conversationPages, threadId]
  );
  const root = cachedRoot ?? messages.find((m) => m.messageId === threadId) ?? null;
  const replies = messages.filter((m) => m.messageId !== threadId);

  const sendReply = useCallback(
    async (content: string, metadata?: MessageMetadata) => {
      const sent = await messageService.sendMessage({
        conversationId,
        content,
        contentType: 'text',
        threadId,
        metadata,
        replyToId: threadId,
        replyToContent: root?.content?.slice(0, 120),
      });
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.THREAD_REPLY_SENT, {
        conversation_id: conversationId,
        thread_id: threadId,
        length: content.length,
      });
      queryClient.setQueryData<ChatMessage[]>(key, (old) => {
        const list = old ?? [];
        return list.some((m) => m.messageId === sent.messageId) ? list : [...list, sent];
      });
      return sent;
    },
    [conversationId, threadId, root?.content, queryClient, key]
  );

  return {
    root,
    replies,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
    sendReply,
  };
}

/** Replies per thread root, from the loaded conversation pages. */
export function countThreadReplies(
  messages: { threadId?: string | null }[]
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of messages) {
    if (!m.threadId) continue;
    counts.set(m.threadId, (counts.get(m.threadId) ?? 0) + 1);
  }
  return counts;
}
