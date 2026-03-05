import { memo } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { COLORS, SPACING } from '@/constants/theme';
import { formatRelativeTime } from '@/utils/formatters';
import { useParticipantAvatar } from '../hooks/useParticipantAvatar';
import type { ChatConversation } from '../types';

interface ConversationItemProps {
  conversation: ChatConversation;
  onPress: (conversationId: string, participantName: string) => void;
}

function ConversationItemInner({ conversation, onPress }: ConversationItemProps) {
  const avatarUri = useParticipantAvatar(conversation.participantId);

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPress(conversation.conversationId, conversation.participantName)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Conversation with ${conversation.participantName || 'User'}${conversation.unreadCount > 0 ? `, ${conversation.unreadCount} unread` : ''}`}
    >
      <Avatar uri={avatarUri} size="md" />
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text variant="h3" numberOfLines={1} style={styles.name}>
            {conversation.participantName || 'User'}
          </Text>
          {conversation.lastMessageAt && (
            <Text variant="small" style={styles.time}>
              {formatRelativeTime(conversation.lastMessageAt)}
            </Text>
          )}
        </View>
        <View style={styles.bottomRow}>
          <Text variant="caption" numberOfLines={1} style={styles.preview}>
            {conversation.lastMessage || ''}
          </Text>
          {conversation.unreadCount > 0 && (
            <View style={styles.badge}>
              <Text variant="small" style={styles.badgeText}>
                {conversation.unreadCount > 99 ? '99+' : String(conversation.unreadCount)}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export const ConversationItem = memo(ConversationItemInner);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border.dark,
    gap: SPACING.md,
  },
  content: {
    flex: 1,
    gap: 2,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    flex: 1,
    color: COLORS.white,
    marginRight: SPACING.sm,
  },
  time: {
    color: COLORS.gray[500],
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  preview: {
    flex: 1,
    color: COLORS.gray[500],
    marginRight: SPACING.sm,
  },
  badge: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: COLORS.white,
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
    lineHeight: 14,
  },
});
