/**
 * Adapts between the backend ChatMessage format and gifted-chat's IMessage format.
 *
 * Single Responsibility: only data mapping, no side effects.
 */

import type { IMessage, User as GiftedUser } from 'react-native-gifted-chat';
import type { ChatMessage, Reaction } from '../types';

export interface AttoMessage extends IMessage {
  conversationId: string;
  contentType: string;
  isEdited: boolean;
  editedAt: string | null;
  isDeleted: boolean;
  isRead: boolean;
  replyToId?: string | null;
  replyToContent?: string | null;
  replyToSender?: string | null;
  reactions: Reaction[];
  status?: 'sending' | 'sent' | 'failed';
}

/**
 * Convert a backend ChatMessage to a gifted-chat IMessage.
 */
export function toGiftedMessage(
  msg: ChatMessage,
  currentUserId: string,
  participantName: string,
  participantAvatar?: string | null
): AttoMessage {
  const isOwn = msg.senderId === currentUserId;

  const user: GiftedUser = {
    _id: msg.senderId,
    name: isOwn ? undefined : participantName,
    avatar: isOwn ? undefined : (participantAvatar ?? undefined),
  };

  return {
    _id: msg.messageId,
    text: msg.isDeleted ? '' : msg.content,
    createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date(),
    user,
    // Extended fields
    conversationId: msg.conversationId,
    contentType: msg.contentType,
    isEdited: msg.isEdited ?? false,
    editedAt: msg.editedAt ?? null,
    isDeleted: msg.isDeleted ?? false,
    isRead: msg.isRead,
    reactions: msg.reactions ?? [],
    status: msg.status,
    // Reply data on extended fields (rendered by our renderCustomView, not GiftedChat built-in)
    replyToId: msg.replyToId,
    replyToContent: msg.replyToContent,
    replyToSender: msg.replyToSender,
    // Gifted-chat tick indicators
    sent: msg.status === 'sent' || (!msg.status && !msg.isRead),
    received: msg.isRead,
    pending: msg.status === 'sending',
    // Media fields
    image: msg.contentType === 'image' ? msg.content : undefined,
    video: msg.contentType === 'video' ? msg.content : undefined,
    audio: msg.contentType === 'audio' ? msg.content : undefined,
    // System message for deleted
    system: msg.isDeleted,
  };
}

/**
 * Convert a batch of ChatMessages to gifted-chat format.
 * Gifted-chat expects messages sorted newest-first (it uses inverted FlatList).
 */
export function toGiftedMessages(
  messages: ChatMessage[],
  currentUserId: string,
  participantName: string,
  participantAvatar?: string | null
): AttoMessage[] {
  return messages.map((m) =>
    toGiftedMessage(m, currentUserId, participantName, participantAvatar)
  );
}
