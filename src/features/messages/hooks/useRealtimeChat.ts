import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { phoenixSocket } from '@/lib/api/phoenixSocket';
import { useChatStore } from '../stores/chatStore';
import type { BackendMessage } from '../types';
import type { ChatMessage, ChatMessagesPage } from '../types';

function mapBackendMessage(m: BackendMessage): ChatMessage {
  return {
    conversationId: m.conversation_id,
    messageId: m.message_id,
    senderId: m.sender_id,
    content: m.content,
    contentType: m.content_type,
    isRead: m.is_read,
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
          // Deduplicate — don't add if already in the first page
          const firstPage = old.pages[0];
          if (firstPage.messages.some((m) => m.messageId === msg.messageId)) {
            return old;
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
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MESSAGES.CONVERSATIONS });
    },
    [conversationId, queryClient]
  );

  useEffect(() => {
    if (!conversationId || joinedRef.current) return;

    const channel = phoenixSocket.joinChannel(conversationId, {
      onMessage: (payload) => {
        const msg = mapBackendMessage(payload as unknown as BackendMessage);
        prependMessage(msg);
      },
      onTyping: (payload) => {
        const { user_id, is_typing } = payload as { user_id: string; is_typing: boolean };
        setTyping(conversationId, user_id, is_typing);
      },
      onMessagesRead: () => {
        // Mark all own messages as read in cache
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
    });

    if (channel) joinedRef.current = true;

    return () => {
      phoenixSocket.leaveChannel(conversationId);
      clearTyping(conversationId);
      joinedRef.current = false;
    };
  }, [conversationId, prependMessage, setTyping, clearTyping, queryClient]);

  /** Send a message via WebSocket (falls back to REST in useChat if this fails). */
  const sendViaSocket = useCallback(
    async (content: string, contentType = 'text') => {
      const resp = await phoenixSocket.pushMessage(conversationId, content, contentType);
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
