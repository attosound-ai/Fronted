import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import type {
  ApiSuccessResponse,
  BackendConversation,
  BackendMessage,
  BackendMessagesResponse,
  BackendReaction,
  ChatConversation,
  ChatMessage,
  ChatMessagesPage,
  Reaction,
  SendMessageDTO,
  CreateConversationDTO,
} from '../types';
import { MESSAGES_PAGE_SIZE } from '../types';

// --- Mappers: snake_case → camelCase ---

function mapConversation(c: BackendConversation): ChatConversation {
  return {
    conversationId: c.conversation_id,
    participantId: c.participant_id,
    participantName: c.participant_name || '',
    lastMessage: c.last_message || null,
    lastMessageAt: c.last_message_at || null,
    unreadCount: c.unread_count,
    updatedAt: c.updated_at || null,
  };
}

function mapMessage(m: BackendMessage): ChatMessage {
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
    replyToId: m.reply_to_id || null,
    replyToContent: m.reply_to_content || null,
    replyToSender: m.reply_to_sender || null,
    createdAt: m.created_at || null,
    reactions: (m.reactions ?? []).map((r) => ({
      messageId: r.message_id,
      userId: r.user_id,
      emoji: r.emoji,
    })),
  };
}

// --- Service ---

export const messageService = {
  async getConversations(): Promise<ChatConversation[]> {
    const response = await apiClient.get<ApiSuccessResponse<BackendConversation[]>>(
      API_ENDPOINTS.MESSAGES.CONVERSATIONS
    );
    const all = response.data.data.map(mapConversation);

    // Deduplicate by participantId — keep the most recently updated one
    const seen = new Map<string, ChatConversation>();
    for (const conv of all) {
      const existing = seen.get(conv.participantId);
      if (!existing || conv.updatedAt > existing.updatedAt) {
        seen.set(conv.participantId, conv);
      }
    }
    return Array.from(seen.values());
  },

  async getMessages(chatId: string, before?: string): Promise<ChatMessagesPage> {
    const response = await apiClient.get<ApiSuccessResponse<BackendMessagesResponse>>(
      API_ENDPOINTS.MESSAGES.CHAT(chatId),
      {
        params: { before, limit: MESSAGES_PAGE_SIZE },
      }
    );
    const { messages, pagination } = response.data.data;
    return {
      messages: messages.map(mapMessage),
      nextCursor: pagination.next_cursor,
      hasMore: pagination.has_more,
    };
  },

  async sendMessage(dto: SendMessageDTO): Promise<ChatMessage> {
    const response = await apiClient.post<ApiSuccessResponse<BackendMessage>>(
      API_ENDPOINTS.MESSAGES.SEND,
      {
        conversationId: dto.conversationId,
        content: dto.content,
        contentType: dto.contentType || 'text',
      }
    );
    return mapMessage(response.data.data);
  },

  async markRead(chatId: string): Promise<void> {
    await apiClient.post(API_ENDPOINTS.MESSAGES.MARK_READ(chatId));
  },

  async createConversation(dto: CreateConversationDTO): Promise<string> {
    const response = await apiClient.post<
      ApiSuccessResponse<{ conversation_id: string }>
    >(API_ENDPOINTS.MESSAGES.CREATE_CONVERSATION, {
      participantId: dto.participantId,
      participantName: dto.participantName || '',
    });
    return response.data.data.conversation_id;
  },

  // ── Edit / Delete ──────────────────────────────

  async editMessage(chatId: string, messageId: string, content: string): Promise<void> {
    await apiClient.patch(`/messages/${chatId}/${messageId}`, { content });
  },

  async deleteMessage(chatId: string, messageId: string): Promise<void> {
    await apiClient.delete(`/messages/${chatId}/${messageId}`);
  },

  // ── Reactions ──────────────────────────────────

  async getReactions(chatId: string, messageId: string): Promise<Reaction[]> {
    const response = await apiClient.get<ApiSuccessResponse<BackendReaction[]>>(
      `/messages/${chatId}/${messageId}/reactions`
    );
    return response.data.data.map((r) => ({
      messageId: r.message_id,
      userId: r.user_id,
      emoji: r.emoji,
    }));
  },

  async addReaction(chatId: string, messageId: string, emoji: string): Promise<void> {
    await apiClient.post(`/messages/${chatId}/${messageId}/reactions`, { emoji });
  },

  async removeReaction(chatId: string, messageId: string, emoji: string): Promise<void> {
    await apiClient.delete(`/messages/${chatId}/${messageId}/reactions/${emoji}`);
  },
};
