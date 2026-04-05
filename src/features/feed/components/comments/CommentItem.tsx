import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/Text';
import { LinkedText } from '../LinkedText';
import { Avatar } from '@/components/ui/Avatar';
import { CreatorBadge } from '@/components/ui/CreatorBadge';
import { formatRelativeTime } from '@/utils/formatters';
import type { Comment } from '../../hooks/useComments';

interface CommentItemProps {
  comment: Comment;
  onReply?: (commentId: string, username: string) => void;
  isReply?: boolean;
}

export function CommentItem({ comment, onReply, isReply }: CommentItemProps) {
  return (
    <View style={[styles.container, isReply && styles.replyContainer]}>
      <Avatar uri={comment.author?.avatar ?? null} size="sm" />
      <View style={styles.content}>
        <View style={styles.usernameRow}>
          <Text variant="body" style={styles.username}>
            {comment.author?.username ?? 'unknown'}
          </Text>
          {comment.author?.role === 'creator' && <CreatorBadge size="sm" />}
        </View>
        <Text variant="body" style={styles.text}>
          <LinkedText style={styles.text}>{comment.comment}</LinkedText>
        </Text>
        <View style={styles.meta}>
          <Text variant="caption" style={styles.time}>
            {formatRelativeTime(comment.createdAt)}
          </Text>
          {!isReply && (
            <TouchableOpacity
              onPress={() => onReply?.(comment.id, comment.author?.username ?? '')}
              hitSlop={8}
            >
              <Text variant="caption" style={styles.replyBtn}>
                Reply
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {comment.replies && comment.replies.length > 0 && (
          <View style={styles.replies}>
            {comment.replies.map((reply) => (
              <CommentItem key={reply.id} comment={reply} isReply />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 10,
  },
  replyContainer: {
    marginLeft: 8,
    paddingVertical: 6,
  },
  content: {
    flex: 1,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  text: {
    color: '#FFF',
    fontSize: 14,
    lineHeight: 20,
  },
  username: {
    fontFamily: 'Archivo_600SemiBold',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 4,
  },
  time: {
    color: '#666',
    fontSize: 12,
  },
  replyBtn: {
    color: '#999',
    fontSize: 12,
    fontFamily: 'Archivo_600SemiBold',
  },
  replies: {
    marginTop: 4,
  },
});
