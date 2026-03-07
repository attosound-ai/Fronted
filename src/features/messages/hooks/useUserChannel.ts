import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { phoenixSocket } from '@/lib/api/phoenixSocket';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { showMessageNotification } from '@/components/ui/MessageNotificationBanner';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';

function extractString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

/**
 * Joins the user-level Phoenix channel (user:<userId>) so the conversation
 * list updates in real-time when messages arrive in any conversation.
 * Also shows an in-app notification banner for incoming messages.
 */
export function useUserChannel() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isSocketConnected = useChatStore((s) => s.isSocketConnected);
  const joinedRef = useRef(false);

  useEffect(() => {
    if (!user || !isSocketConnected || joinedRef.current) return;

    const userId = String(user.id);

    const channel = phoenixSocket.joinUserChannel(userId, {
      onConversationUpdated: (payload: Record<string, unknown>) => {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.MESSAGES.CONVERSATIONS,
        });

        const senderId = extractString(payload.sender_id);
        const conversationId = extractString(payload.conversation_id);
        const lastMessage =
          typeof payload.last_message === 'string' ? payload.last_message : '';

        // Don't show notification for own messages or if already in that chat
        if (senderId === userId) return;
        const activeChat = useChatStore.getState().activeConversationId;
        if (activeChat === conversationId) return;

        // Fetch sender profile from cache or network, then show banner
        const numericSenderId = Number(senderId);
        if (Number.isNaN(numericSenderId) || numericSenderId <= 0) return;

        queryClient
          .ensureQueryData({
            queryKey: QUERY_KEYS.USERS.PROFILE(numericSenderId),
            queryFn: async () => {
              const res = await apiClient.get(
                API_ENDPOINTS.USERS.PROFILE(numericSenderId)
              );
              return res.data.data;
            },
            staleTime: 1000 * 60 * 30,
          })
          .then((profile) => {
            showMessageNotification({
              senderName: (profile?.displayName as string) || 'User',
              senderAvatar: (profile?.avatar as string) || null,
              message: lastMessage,
              conversationId,
              senderId,
            });
          })
          .catch(() => {
            showMessageNotification({
              senderName: 'New message',
              senderAvatar: null,
              message: lastMessage,
              conversationId,
              senderId,
            });
          });
      },
    });

    if (channel) joinedRef.current = true;

    return () => {
      phoenixSocket.leaveUserChannel();
      joinedRef.current = false;
    };
  }, [user, isSocketConnected, queryClient]);
}
