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
  deleted_at?: string | null;
  deleted_by?: string | null;
  reply_to_id: string | null;
  reply_to_content: string | null;
  reply_to_sender: string | null;
  created_at: string | null;
  reactions?: BackendReaction[];
  /** JSON metadata: media url, duration, waveform, iMessage style effect. */
  metadata?: Record<string, unknown> | null;
  thread_id?: string | null;
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
  /** Stable list key across the optimistic temp id and the server id, so
   * the row never remounts (a remount showed a ghost copy for one frame). */
  clientKey?: string;
  senderId: string;
  content: string;
  contentType: string;
  isRead: boolean;
  isEdited?: boolean;
  editedAt?: string | null;
  isDeleted?: boolean;
  deletedAt?: string | null;
  deletedBy?: string | null;
  replyToId?: string | null;
  replyToContent?: string | null;
  replyToSender?: string | null;
  createdAt: string | null;
  status?: MessageStatus;
  reactions?: Reaction[];
  metadata?: MessageMetadata | null;
  threadId?: string | null;
}

export interface Reaction {
  messageId: string;
  userId: string;
  emoji: string;
}

// DTOs

/**
 * Media and effect details that ride along a message. `content` keeps the
 * media url (or the text) so older clients still show something.
 */
export interface MessageMetadata {
  durationMs?: number;
  /** 0 to 1 bars for voice notes. */
  waveform?: number[];
  mime?: string;
  width?: number;
  height?: number;
  thumbnailUrl?: string;
  fileName?: string;
  bytes?: number;
  /** iMessage style effect played once on arrival. */
  effect?: { kind: 'bubble' | 'screen'; name: string };
  /** A post shared into the chat: enough to draw and play the card. */
  post?: SharedPost;
  /** A note written with the shared post, shown under the card. */
  caption?: string;
  [key: string]: unknown;
}

/** The part of a feed post a chat card needs, carried in the metadata. */
export interface SharedPost {
  id: string;
  type: string;
  title?: string;
  description?: string;
  authorId?: string;
  authorName?: string;
  authorAvatar?: string;
  coverUrl?: string;
  thumbnailUrl?: string;
  audioUrl?: string;
  videoUrl?: string;
  imageUrl?: string;
  /** Seconds, as the feed reports it. */
  duration?: number;
}

export type MessageContentType =
  | 'text'
  | 'post'
  | 'audio'
  | 'video_note'
  | 'image'
  | 'video'
  | 'file'
  | 'location'
  | 'contact';

export interface SendMessageDTO {
  conversationId: string;
  content: string;
  contentType?: string;
  metadata?: MessageMetadata;
  threadId?: string;
  replyToId?: string;
  replyToContent?: string;
  replyToSender?: string;
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

// Chat wallpapers (remote-managed via content-service)

export type ChatWallpaperKind = 'image' | 'gradient' | 'pattern';

export interface BackendChatWallpaper {
  id: string;
  name: string;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  tintColor?: string | null;
  overlayOpacity?: number | null;
  kind?: ChatWallpaperKind | null;
  gradientColors?: string[] | null;
  patternUrl?: string | null;
  patternOpacity?: number | null;
  sortOrder?: number;
  createdAt?: string | null;
}

export interface ChatWallpaper {
  id: string;
  name: string;
  /** Tile for `image` wallpapers; empty for the other kinds. */
  imageUrl: string;
  thumbnailUrl: string | null;
  tintColor: string | null;
  overlayOpacity: number | null;
  kind: ChatWallpaperKind;
  /** Two to four HEX colours, top left to bottom right. */
  gradientColors: string[];
  /** Tileable line art drawn over the gradient for `pattern` wallpapers. */
  patternUrl: string | null;
  patternOpacity: number | null;
  sortOrder: number;
  createdAt: string | null;
}

// Constants

export const MESSAGES_PAGE_SIZE = 50;
