import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { messageService } from '../services/messageService';
import type { ChatMessage } from '../types';

/**
 * The pinned messages of a conversation, the bar Telegram and WhatsApp keep
 * under the header. The list comes from the server and both sides are kept
 * in step by the `message_pinned` and `message_unpinned` channel events (see
 * `useRealtimeChat`), which invalidate this query.
 */
export function usePinnedMessages(conversationId: string) {
  const queryClient = useQueryClient();
  const key = QUERY_KEYS.MESSAGES.PINNED(conversationId);

  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => messageService.getPinned(conversationId),
    enabled: !!conversationId,
    staleTime: 60_000,
  });

  const pinMutation = useMutation({
    mutationFn: (messageId: string) =>
      messageService.pinMessage(conversationId, messageId),
    onSuccess: (_res, messageId) => {
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.MESSAGE_PINNED, {
        conversation_id: conversationId,
        message_id: messageId,
      });
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (error, messageId) => {
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.MESSAGE_PIN_FAILED, {
        conversation_id: conversationId,
        message_id: messageId,
        action: 'pin',
        error: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const unpinMutation = useMutation({
    mutationFn: (messageId: string) =>
      messageService.unpinMessage(conversationId, messageId),
    onSuccess: (_res, messageId) => {
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.MESSAGE_UNPINNED, {
        conversation_id: conversationId,
        message_id: messageId,
      });
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (error, messageId) => {
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.MESSAGE_PIN_FAILED, {
        conversation_id: conversationId,
        message_id: messageId,
        action: 'unpin',
        error: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const pinned: ChatMessage[] = data ?? [];
  const isPinned = useCallback(
    (messageId: string) => pinned.some((m) => m.messageId === messageId),
    [pinned]
  );

  return {
    pinned,
    isLoading,
    isPinned,
    pin: (messageId: string) => pinMutation.mutate(messageId),
    unpin: (messageId: string) => unpinMutation.mutate(messageId),
  };
}
