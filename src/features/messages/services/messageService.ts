import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import type {
  ApiSuccessResponse,
  BackendConversation,
  BackendMessage,
  BackendMessagesResponse,
  ChatConversation,
  ChatMessage,
  ChatMessagesPage,
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
    createdAt: m.created_at || null,
  };
}

// --- Service ---

export const messageService = {
  async getConversations(): Promise<ChatConversation[]> {
    const response = await apiClient.get<ApiSuccessResponse<BackendConversation[]>>(
      API_ENDPOINTS.MESSAGES.CONVERSATIONS
    );
    return response.data.data.map(mapConversation);
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
};
