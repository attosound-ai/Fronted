/**
 * useMessageActions — edit and delete messages.
 *
 * Single Responsibility: only edit/delete + optimistic cache updates.
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { phoenixSocket } from '@/lib/api/phoenixSocket';
import { messageService } from '../services/messageService';
import type { ChatMessagesPage } from '../types';

export type EditOutcome =
  | 'ok'
  | 'edit_window_closed'
  | 'edit_limit_reached'
  | 'not_editable'
  | 'failed';

const RULE_REFUSALS = ['edit_window_closed', 'edit_limit_reached', 'not_editable'] as const;

/** The server's rule refusal from a socket reply or a REST 422, if that is what failed. */
function ruleRefusal(err: unknown): EditOutcome | null {
  const e = err as { reason?: unknown; response?: { data?: { error?: unknown } } } | null;
  const reason = e?.reason ?? e?.response?.data?.error;
  return typeof reason === 'string' && (RULE_REFUSALS as readonly string[]).includes(reason)
    ? (reason as EditOutcome)
    : null;
}

export function useMessageActions(conversationId: string) {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  const updateMessage = useCallback(
    (
      messageId: string,
      updater: (msg: ChatMessagesPage['messages'][0]) => ChatMessagesPage['messages'][0]
    ) => {
      queryClient.setQueryData(
        QUERY_KEYS.MESSAGES.CHAT(conversationId),
        (old: { pages: ChatMessagesPage[]; pageParams: unknown[] } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((m) =>
                m.messageId === messageId ? updater(m) : m
              ),
            })),
          };
        }
      );
    },
    [conversationId, queryClient]
  );

  /**
   * Resolves 'ok' or the server's refusal ('edit_window_closed',
   * 'edit_limit_reached', 'not_editable', 'failed'). A rule refusal is final:
   * the REST retry only covers a socket that could not deliver.
   */
  const editMessage = useCallback(
    async (messageId: string, newContent: string): Promise<EditOutcome> => {
      if (!userId) return 'failed';

      let previous: ChatMessagesPage['messages'][0] | null = null;
      updateMessage(messageId, (m) => {
        previous = m;
        return {
          ...m,
          content: newContent,
          isEdited: true,
          editedAt: new Date().toISOString(),
          editHistory: [
            ...(m.editHistory ?? []),
            { content: m.content, since: m.editedAt ?? m.createdAt ?? null },
          ],
        };
      });
      const restore = () => {
        const before = previous;
        if (before) updateMessage(messageId, () => before);
      };

      try {
        await phoenixSocket.editMessage(conversationId, messageId, newContent);
        return 'ok';
      } catch (socketErr) {
        const reason = ruleRefusal(socketErr);
        if (reason) {
          restore();
          return reason;
        }
        try {
          await messageService.editMessage(conversationId, messageId, newContent);
          return 'ok';
        } catch (restErr) {
          restore();
          // Refetch from server — authoritative truth, survives any optimistic drift.
          queryClient.invalidateQueries({
            queryKey: QUERY_KEYS.MESSAGES.CHAT(conversationId),
          });
          return ruleRefusal(restErr) ?? 'failed';
        }
      }
    },
    [conversationId, userId, updateMessage, queryClient]
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!userId) return;

      updateMessage(messageId, (m) => ({
        ...m,
        isDeleted: true,
        content: '',
      }));

      try {
        await phoenixSocket.deleteMessage(conversationId, messageId);
      } catch {
        try {
          await messageService.deleteMessage(conversationId, messageId);
        } catch {
          queryClient.invalidateQueries({
            queryKey: QUERY_KEYS.MESSAGES.CHAT(conversationId),
          });
        }
      }
    },
    [conversationId, userId, updateMessage, queryClient]
  );

  const canEditOrDelete = useCallback(
    (senderId: string) => {
      return userId ? String(userId) === senderId : false;
    },
    [userId]
  );

  return { editMessage, deleteMessage, canEditOrDelete };
}
