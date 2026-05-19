import { useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { messageService } from '../services/messageService';

export interface UseConversationIdArgs {
  /** Known conversation id (from a conversation list, notification, deep link). */
  conversationId?: string;
  /** The other user's id — used to get-or-create the 1:1 conversation. */
  participantId?: string;
  /** Display name passed through to the create call (bare @username). */
  participantName?: string;
}

export interface UseConversationIdResult {
  /** Resolved conversation id, or '' until it is known. */
  conversationId: string;
  isResolving: boolean;
  error: Error | null;
  retry: () => void;
}

const NO_TARGET = new Error(
  'No conversation target: missing both conversationId and participantId'
);

/**
 * Resolves a usable conversation id for the chat screen.
 *
 * - If a non-empty `conversationId` is provided, it is returned immediately with
 *   zero network (conversation lists, notifications, deep links, iPad inline).
 * - Otherwise, if a `participantId` is provided, the conversation is resolved via
 *   `messageService.createConversation` — which is an **idempotent get-or-create**
 *   on the backend (same participant → same conversation_id, no duplicates). The
 *   call is React-Query-cached and de-duplicated, so rageclicks / remounts trigger
 *   a single request and re-entry is instant.
 * - If neither is provided, surfaces a deterministic error.
 *
 * This centralises the get-or-create-then-open dance so no navigation call site
 * has to reimplement it (DRY) and `ChatScreen` can rely on always receiving a
 * resolved, non-empty conversation id.
 */
export function useConversationId({
  conversationId,
  participantId,
  participantName,
}: UseConversationIdArgs): UseConversationIdResult {
  const known = conversationId?.trim() ? conversationId : '';
  const pid = participantId?.trim() ? participantId : '';
  const needsResolve = !known && !!pid;

  const query = useQuery({
    queryKey: QUERY_KEYS.MESSAGES.CONVERSATION_BY_PARTICIPANT(pid),
    queryFn: async () => {
      const id = await messageService.createConversation({
        participantId: pid,
        participantName,
      });
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.NEW_CONVERSATION_STARTED, {
        participant_id: pid,
        source: 'resolve',
      });
      return id;
    },
    enabled: needsResolve,
    // participant → conversation mapping is stable for the session
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60,
    retry: 1,
  });

  const { refetch, error: queryError, isError } = query;

  useEffect(() => {
    if (needsResolve && isError && queryError) {
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.CONVERSATION_RESOLVE_FAILED, {
        participant_id: pid,
        error: queryError instanceof Error ? queryError.message : 'unknown',
      });
    }
  }, [needsResolve, isError, queryError, pid]);

  const retry = useCallback(() => {
    if (needsResolve) refetch();
  }, [needsResolve, refetch]);

  const resolved = known || (needsResolve ? (query.data ?? '') : '');
  const error = !known && !pid ? NO_TARGET : needsResolve ? queryError : null;

  return {
    conversationId: resolved,
    isResolving: needsResolve && query.isLoading,
    error: (error as Error | null) ?? null,
    retry,
  };
}
