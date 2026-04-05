// Backend response shapes (what the API returns — snake_case atom keys)

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  error: null;
}

export interface BackendConversation {
  conversation_id: string;
  participant_id: string;
  participant_name: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  updated_at: string | null;
}

export interface BackendMessage {
  conversation_id: string;
  message_id: string;
  sender_id: string;
  content: string;
  content_type: string;
  is_read: boolean;
  is_edited: boolean;
  edited_at: string | null;
  is_deleted: boolean;
  reply_to_id: string | null;
  reply_to_content: string | null;
  reply_to_sender: string | null;
  created_at: string | null;
  reactions?: BackendReaction[];
}

export interface BackendReaction {
  message_id: string;
  conversation_id: string;
  user_id: string;
  emoji: string;
  created_at: string | null;
}

export interface BackendMessagesResponse {
  messages: BackendMessage[];
  pagination: { next_cursor: string | null; has_more: boolean };
}

// Frontend UI shapes (what components consume — camelCase)

export interface ChatConversation {
  conversationId: string;
  participantId: string;
  participantName: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  updatedAt: string | null;
}

export type MessageStatus = 'sending' | 'sent' | 'failed';

export interface ChatMessage {
  conversationId: string;
  messageId: string;
  senderId: string;
  content: string;
  contentType: string;
  isRead: boolean;
  isEdited?: boolean;
  editedAt?: string | null;
  isDeleted?: boolean;
  replyToId?: string | null;
  replyToContent?: string | null;
  replyToSender?: string | null;
  createdAt: string | null;
  status?: MessageStatus;
  reactions?: Reaction[];
}

export interface Reaction {
  messageId: string;
  userId: string;
  emoji: string;
}

// DTOs

export interface SendMessageDTO {
  conversationId: string;
  content: string;
  contentType?: string;
}

export interface CreateConversationDTO {
  participantId: string;
  participantName?: string;
}

// Paginated response (mapped)

export interface ChatMessagesPage {
  messages: ChatMessage[];
  nextCursor: string | null;
  hasMore: boolean;
}

// Constants

export const MESSAGES_PAGE_SIZE = 50;
