import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { phoenixSocket } from '@/lib/api/phoenixSocket';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '../stores/chatStore';
import type {
  BackendMessage,
  BackendReaction,
  Reaction,
  ChatMessage,
  ChatMessagesPage,
} from '../types';

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
      let outcome: 'no_cache' | 'replaced_temp' | 'prepended' = 'prepended';
      queryClient.setQueryData(
        QUERY_KEYS.MESSAGES.CHAT(conversationId),
        (old: { pages: ChatMessagesPage[]; pageParams: unknown[] } | undefined) => {
          if (!old) {
            outcome = 'no_cache';
            return old;
          }
          const firstPage = old.pages[0];
          // Deduplicate: skip if messageId already exists OR if there's a
          // temp optimistic message with the same content (own message echo)
          if (firstPage.messages.some((m) => isEchoOf(m, msg))) {
            outcome = 'replaced_temp';
            // Replace the temp message with the real server message
            return {
              ...old,
              pages: [
                {
                  ...firstPage,
                  messages: firstPage.messages.map((m) =>
                    m.messageId.startsWith('temp-') && isEchoOf(m, msg)
                      ? {
                          ...msg,
                          clientKey: m.clientKey ?? m.messageId,
                          status: 'sent' as const,
                        }
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
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.CACHE_PREPEND, {
        conversation_id: conversationId,
        message_id: msg.messageId,
        content_type: msg.contentType ?? 'text',
        outcome,
      });
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
        // How long the message took from the server stamp to this screen:
        // the number to watch when real time feels slow.
        const stamped = msg.createdAt ? Date.parse(msg.createdAt) : NaN;
        const deliveryMs = Number.isNaN(stamped) ? null : Date.now() - stamped;
        analytics.capture(ANALYTICS_EVENTS.MESSAGES.MESSAGE_RECEIVED_REALTIME, {
          conversation_id: conversationId,
          message_id: msg.messageId,
          sender_id: msg.senderId,
          has_reply: !!msg.replyToId,
          content_type: msg.contentType ?? 'text',
          delivery_ms: deliveryMs,
          own_echo: String(msg.senderId) === String(useAuthStore.getState().user?.id),
        });
      },
      onTyping: (payload) => {
        const { user_id, is_typing } = payload as { user_id: string; is_typing: boolean };
        setTyping(conversationId, user_id, is_typing);
        analytics.capture(ANALYTICS_EVENTS.MESSAGES.TYPING_RECEIVED, {
          conversation_id: conversationId,
          user_id,
          is_typing,
        });
      },
      onMessagesRead: (payload) => {
        // chat-service broadcasts `messages_read` to every subscriber on the
        // channel (the REST path can't broadcast_from!, so it can't exclude
        // the reader). Filter out our own read events here — flipping our
        // OWN sent messages to isRead just because *we* read incoming ones
        // would falsely show "delivered" status when the other side hasn't
        // actually seen them yet.
        const readerId = (payload as { user_id?: string })?.user_id;
        const myId = useAuthStore.getState().user?.id;
        if (readerId && myId != null && String(readerId) === String(myId)) {
          return;
        }
        // The other side just read us: stamp it for the "Read 12:17" label.
        useChatStore.getState().setReadAt(conversationId, new Date().toISOString());
        analytics.capture(ANALYTICS_EVENTS.MESSAGES.READ_RECEIPT, {
          conversation_id: conversationId,
          reader_id: readerId ?? null,
        });
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
      onMessagePinned: (payload) => {
        const { message_id, pinned_by } = payload as {
          message_id?: string;
          pinned_by?: string;
        };
        analytics.capture(ANALYTICS_EVENTS.MESSAGES.PINNED_REALTIME, {
          conversation_id: conversationId,
          message_id: message_id ?? null,
          actor_id: pinned_by ?? null,
          action: 'pinned',
        });
        void queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.MESSAGES.PINNED(conversationId),
        });
      },
      onMessageUnpinned: (payload) => {
        const { message_id, unpinned_by } = payload as {
          message_id?: string;
          unpinned_by?: string;
        };
        analytics.capture(ANALYTICS_EVENTS.MESSAGES.PINNED_REALTIME, {
          conversation_id: conversationId,
          message_id: message_id ?? null,
          actor_id: unpinned_by ?? null,
          action: 'unpinned',
        });
        void queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.MESSAGES.PINNED(conversationId),
        });
      },
      onMessageDeleted: (payload) => {
        const { message_id, deleted_at, deleted_by } = payload as {
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
      // No socket right now (token refresh in flight, app just resumed). The
      // subscription is registered in the socket manager and is created the
      // moment a socket opens, so this is transient and needs no remount.
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.CHANNEL_JOIN_FAILED, {
        conversation_id: conversationId,
        will_join_on_connect: true,
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

  /** Send a message via WebSocket (falls back to REST in ChatScreen if this fails). */
  const sendViaSocket = useCallback(
    async (
      content: string,
      contentType = 'text',
      replyTo?: { id: string; content: string; sender: string },
      extra?: { metadata?: Record<string, unknown>; threadId?: string }
    ) => {
      const resp = await phoenixSocket.pushMessage(
        conversationId,
        content,
        contentType,
        replyTo,
        extra
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

/**
 * Is the cached row the optimistic copy (or the same row) of a message that
 * just arrived on the channel? Text echoes match by content; a media echo
 * cannot (the optimistic row holds the local file, the server the hosted
 * url), so a pending media row of the same kind from the same sender is it.
 */
function isEchoOf(
  cached: {
    messageId: string;
    content: string;
    contentType?: string;
    senderId: string;
    status?: string;
  },
  incoming: { messageId: string; content: string; contentType?: string; senderId: string }
): boolean {
  if (cached.messageId === incoming.messageId) return true;
  if (!cached.messageId.startsWith('temp-')) return false;
  if (cached.content === incoming.content) return true;
  const kind = cached.contentType ?? 'text';
  return (
    kind !== 'text' &&
    kind === (incoming.contentType ?? 'text') &&
    cached.senderId === incoming.senderId &&
    cached.status === 'sending'
  );
}
