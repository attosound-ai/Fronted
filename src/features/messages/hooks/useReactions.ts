/**
 * useReactions — manages emoji reactions on messages.
 *
 * Single Responsibility: only reaction add/remove + optimistic cache updates.
 * Dependency Inversion: depends on phoenixSocket abstraction, not a concrete WebSocket.
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { phoenixSocket } from '@/lib/api/phoenixSocket';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { messageService } from '../services/messageService';
import type { ChatMessage, ChatMessagesPage, Reaction } from '../types';

export function useReactions(conversationId: string) {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  const updateMessageReactions = useCallback(
    (messageId: string, updater: (reactions: Reaction[]) => Reaction[]) => {
      queryClient.setQueryData(
        QUERY_KEYS.MESSAGES.CHAT(conversationId),
        (old: { pages: ChatMessagesPage[]; pageParams: unknown[] } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((m) =>
                m.messageId === messageId
                  ? { ...m, reactions: updater(m.reactions ?? []) }
                  : m
              ),
            })),
          };
        }
      );
    },
    [conversationId, queryClient]
  );

  const addReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!userId) return;
      const uid = String(userId);

      // Optimistic: add immediately
      updateMessageReactions(messageId, (reactions) => {
        if (reactions.some((r) => r.userId === uid && r.emoji === emoji))
          return reactions;
        return [...reactions, { messageId, userId: uid, emoji }];
      });

      try {
        await phoenixSocket.addReaction(conversationId, messageId, emoji);
        analytics.capture(ANALYTICS_EVENTS.MESSAGES.REACTION_ADDED, {
          conversation_id: conversationId,
          message_id: messageId,
          emoji,
        });
      } catch {
        try {
          await messageService.addReaction(conversationId, messageId, emoji);
          analytics.capture(ANALYTICS_EVENTS.MESSAGES.REACTION_ADDED, {
            conversation_id: conversationId,
            message_id: messageId,
            emoji,
            transport: 'rest_fallback',
          });
        } catch {
          updateMessageReactions(messageId, (reactions) =>
            reactions.filter((r) => !(r.userId === uid && r.emoji === emoji))
          );
          analytics.capture(ANALYTICS_EVENTS.MESSAGES.REACTION_FAILED, {
            conversation_id: conversationId,
            message_id: messageId,
            emoji,
            action: 'add',
          });
        }
      }
    },
    [conversationId, userId, updateMessageReactions]
  );

  const removeReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!userId) return;
      const uid = String(userId);

      // Optimistic: remove immediately
      updateMessageReactions(messageId, (reactions) =>
        reactions.filter((r) => !(r.userId === uid && r.emoji === emoji))
      );

      try {
        await phoenixSocket.removeReaction(conversationId, messageId, emoji);
        analytics.capture(ANALYTICS_EVENTS.MESSAGES.REACTION_REMOVED, {
          conversation_id: conversationId,
          message_id: messageId,
          emoji,
        });
      } catch {
        try {
          await messageService.removeReaction(conversationId, messageId, emoji);
          analytics.capture(ANALYTICS_EVENTS.MESSAGES.REACTION_REMOVED, {
            conversation_id: conversationId,
            message_id: messageId,
            emoji,
            transport: 'rest_fallback',
          });
        } catch {
          updateMessageReactions(messageId, (reactions) => [
            ...reactions,
            { messageId, userId: uid, emoji },
          ]);
          analytics.capture(ANALYTICS_EVENTS.MESSAGES.REACTION_FAILED, {
            conversation_id: conversationId,
            message_id: messageId,
            emoji,
            action: 'remove',
          });
        }
      }
    },
    [conversationId, userId, updateMessageReactions]
  );

  const toggleReaction = useCallback(
    (messageId: string, emoji: string, currentReactions: Reaction[]) => {
      if (!userId) return;
      const uid = String(userId);
      const exists = currentReactions.some((r) => r.userId === uid && r.emoji === emoji);
      if (exists) {
        removeReaction(messageId, emoji);
      } else {
        addReaction(messageId, emoji);
      }
    },
    [userId, addReaction, removeReaction]
  );

  return { addReaction, removeReaction, toggleReaction };
}
