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

  const editMessage = useCallback(
    async (messageId: string, newContent: string) => {
      if (!userId) return;
      const uid = String(userId);

      // Snapshot for rollback
      const snapshot = queryClient.getQueryData(QUERY_KEYS.MESSAGES.CHAT(conversationId));

      // Optimistic update
      updateMessage(messageId, (m) => ({
        ...m,
        content: newContent,
        isEdited: true,
        editedAt: new Date().toISOString(),
      }));

      try {
        await phoenixSocket.editMessage(conversationId, messageId, newContent);
      } catch {
        try {
          await messageService.editMessage(conversationId, messageId, newContent);
        } catch {
          // Rollback
          queryClient.setQueryData(QUERY_KEYS.MESSAGES.CHAT(conversationId), snapshot);
        }
      }
    },
    [conversationId, userId, updateMessage, queryClient]
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!userId) return;

      const snapshot = queryClient.getQueryData(QUERY_KEYS.MESSAGES.CHAT(conversationId));

      // Optimistic: mark as deleted
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
          queryClient.setQueryData(QUERY_KEYS.MESSAGES.CHAT(conversationId), snapshot);
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
