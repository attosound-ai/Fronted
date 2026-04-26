import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { phoenixSocket } from '@/lib/api/phoenixSocket';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { useChatStore } from '../stores/chatStore';
import type { BackendMessage, BackendReaction, Reaction } from '../types';
import type { ChatMessage, ChatMessagesPage } from '../types';

function mapBackendMessage(m: BackendMessage): ChatMessage {
  return {
    conversationId: m.conversation_id,
    messageId: m.message_id,
    senderId: m.sender_id,
    content: m.content,
    contentType: m.content_type,
    isRead: m.is_read,
    isEdited: m.is_edited || false,
    editedAt: m.edited_at || null,
    isDeleted: m.is_deleted || false,
    deletedAt: m.deleted_at ?? null,
    deletedBy: m.deleted_by ?? null,
    replyToId: m.reply_to_id || null,
    replyToContent: m.reply_to_content || null,
    replyToSender: m.reply_to_sender || null,
    createdAt: m.created_at || null,
  };
}

/**
 * Hook that manages the Phoenix Channel subscription for a conversation.
 * Handles real-time message delivery, typing indicators, and read receipts.
 */
export function useRealtimeChat(conversationId: string) {
  const queryClient = useQueryClient();
  const setTyping = useChatStore((s) => s.setTyping);
  const clearTyping = useChatStore((s) => s.clearTyping);
  const joinedRef = useRef(false);

  const prependMessage = useCallback(
    (msg: ChatMessage) => {
      queryClient.setQueryData(
        QUERY_KEYS.MESSAGES.CHAT(conversationId),
        (old: { pages: ChatMessagesPage[]; pageParams: unknown[] } | undefined) => {
          if (!old) return old;
          const firstPage = old.pages[0];
          // Deduplicate: skip if messageId already exists OR if there's a
          // temp optimistic message with the same content (own message echo)
          if (
            firstPage.messages.some(
              (m) =>
                m.messageId === msg.messageId ||
                (m.messageId.startsWith('temp-') && m.content === msg.content)
            )
          ) {
            // Replace the temp message with the real server message
            return {
              ...old,
              pages: [
                {
                  ...firstPage,
                  messages: firstPage.messages.map((m) =>
                    m.messageId.startsWith('temp-') && m.content === msg.content
                      ? { ...msg, status: 'sent' as const }
                      : m
                  ),
                },
                ...old.pages.slice(1),
              ],
            };
          }
          return {
            ...old,
            pages: [
              { ...firstPage, messages: [msg, ...firstPage.messages] },
              ...old.pages.slice(1),
            ],
          };
        }
      );
      // Refresh conversation list sidebar
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MESSAGES.CONVERSATIONS() });
    },
    [conversationId, queryClient]
  );

  const updateMessageInCache = useCallback(
    (messageId: string, updater: (msg: ChatMessage) => ChatMessage) => {
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

  useEffect(() => {
    if (!conversationId || joinedRef.current) return;

    const channel = phoenixSocket.joinChannel(conversationId, {
      onMessage: (payload) => {
        const msg = mapBackendMessage(payload as unknown as BackendMessage);
        prependMessage(msg);
        analytics.capture(ANALYTICS_EVENTS.MESSAGES.MESSAGE_RECEIVED_REALTIME, {
          conversation_id: conversationId,
          message_id: msg.messageId,
          sender_id: msg.senderId,
          has_reply: !!msg.replyToId,
        });
      },
      onTyping: (payload) => {
        const { user_id, is_typing } = payload as { user_id: string; is_typing: boolean };
        setTyping(conversationId, user_id, is_typing);
      },
      onMessagesRead: () => {
        queryClient.setQueryData(
          QUERY_KEYS.MESSAGES.CHAT(conversationId),
          (old: { pages: ChatMessagesPage[]; pageParams: unknown[] } | undefined) => {
            if (!old) return old;
            return {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                messages: page.messages.map((m) => ({ ...m, isRead: true })),
              })),
            };
          }
        );
      },
      onReactionAdded: (payload) => {
        const r = payload as unknown as BackendReaction;
        const reaction: Reaction = {
          messageId: r.message_id,
          userId: r.user_id,
          emoji: r.emoji,
        };
        updateMessageInCache(r.message_id, (m) => ({
          ...m,
          reactions: [
            ...(m.reactions ?? []).filter(
              (x) => !(x.userId === reaction.userId && x.emoji === reaction.emoji)
            ),
            reaction,
          ],
        }));
      },
      onReactionRemoved: (payload) => {
        const { message_id, user_id, emoji } = payload as {
          message_id: string;
          user_id: string;
          emoji: string;
        };
        updateMessageInCache(message_id, (m) => ({
          ...m,
          reactions: (m.reactions ?? []).filter(
            (x) => !(x.userId === user_id && x.emoji === emoji)
          ),
        }));
      },
      onMessageEdited: (payload) => {
        const { message_id, content, edited_at } = payload as {
          message_id: string;
          content: string;
          edited_at: string;
        };
        updateMessageInCache(message_id, (m) => ({
          ...m,
          content,
          isEdited: true,
          editedAt: edited_at,
        }));
      },
      onMessageDeleted: (payload) => {
        const {
          message_id,
          deleted_at,
          deleted_by,
        } = payload as {
          message_id: string;
          deleted_at?: string;
          deleted_by?: string;
        };
        updateMessageInCache(message_id, (m) => ({
          ...m,
          isDeleted: true,
          content: '',
          deletedAt: deleted_at ?? m.deletedAt ?? null,
          deletedBy: deleted_by ?? m.deletedBy ?? null,
        }));
      },
    });

    if (channel) {
      joinedRef.current = true;
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.CHANNEL_JOINED, {
        conversation_id: conversationId,
      });
    } else {
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.CHANNEL_JOIN_FAILED, {
        conversation_id: conversationId,
      });
    }

    return () => {
      phoenixSocket.leaveChannel(conversationId);
      clearTyping(conversationId);
      joinedRef.current = false;
    };
  }, [
    conversationId,
    prependMessage,
    updateMessageInCache,
    setTyping,
    clearTyping,
    queryClient,
  ]);

  /** Send a message via WebSocket (falls back to REST in useChat if this fails). */
  const sendViaSocket = useCallback(
    async (
      content: string,
      contentType = 'text',
      replyTo?: { id: string; content: string; sender: string }
    ) => {
      const resp = await phoenixSocket.pushMessage(
        conversationId,
        content,
        contentType,
        replyTo
      );
      return mapBackendMessage(resp as unknown as BackendMessage);
    },
    [conversationId]
  );

  /** Mark all messages as read. */
  const markRead = useCallback(() => {
    phoenixSocket.markRead(conversationId);
  }, [conversationId]);

  /** Send a typing indicator. */
  const sendTyping = useCallback(
    (isTyping: boolean) => {
      phoenixSocket.sendTyping(conversationId, isTyping);
    },
    [conversationId]
  );

  return { sendViaSocket, markRead, sendTyping };
}
