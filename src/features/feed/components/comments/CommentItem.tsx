import {
  View,
  TouchableOpacity,
  ActionSheetIOS,
  Platform,
  Alert,
  StyleSheet,
} from 'react-native';
import { Ellipsis } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { LinkedText } from '../LinkedText';
import { Avatar } from '@/components/ui/Avatar';
import { CreatorBadge } from '@/components/ui/CreatorBadge';
import { formatRelativeTime } from '@/utils/formatters';
import type { Comment } from '../../hooks/useComments';

interface CommentItemProps {
  comment: Comment;
  onReply?: (commentId: string, username: string) => void;
  onEdit?: (commentId: string, currentText: string) => void;
  onDelete?: (commentId: string) => void;
  canModify?: boolean;
  isReply?: boolean;
}

export function CommentItem({
  comment,
  onReply,
  onEdit,
  onDelete,
  canModify,
  isReply,
}: CommentItemProps) {
  const { t } = useTranslation(['feed', 'common']);
  const showActions = () => {
    const options = [
      t('comments.edit'),
      t('common:buttons.delete'),
      t('common:buttons.cancel'),
    ];
    const destructiveIndex = 1;
    const cancelIndex = 2;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          destructiveButtonIndex: destructiveIndex,
          cancelButtonIndex: cancelIndex,
        },
        (index) => {
          if (index === 0) onEdit?.(comment.id, comment.comment);
          if (index === 1) onDelete?.(comment.id);
        }
      );
    } else {
      Alert.alert(t('comments.menuTitle'), '', [
        { text: t('comments.edit'), onPress: () => onEdit?.(comment.id, comment.comment) },
        {
          text: t('common:buttons.delete'),
          style: 'destructive',
          onPress: () => onDelete?.(comment.id),
        },
        { text: t('common:buttons.cancel'), style: 'cancel' },
      ]);
    }
  };

  return (
    <View style={[styles.container, isReply && styles.replyContainer]}>
      <Avatar
        uri={comment.author?.avatar ?? null}
        size="sm"
        creatorRing={comment.author?.role === 'creator'}
        fallbackText={comment.author?.username}
      />
      <View style={styles.content}>
        <View style={styles.usernameRow}>
          <Text variant="body" style={styles.username}>
            {comment.author?.username ?? t('comments.unknownUser')}
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
          {comment.isEdited && (
            <Text variant="caption" style={styles.editedBadge}>
              {t('comments.editedBadge')}
            </Text>
          )}
          {!isReply && (
            <TouchableOpacity
              onPress={() => onReply?.(comment.id, comment.author?.username ?? '')}
              hitSlop={8}
            >
              <Text variant="caption" style={styles.replyBtn}>
                {t('comments.reply')}
              </Text>
            </TouchableOpacity>
          )}
          {canModify && (
            <TouchableOpacity onPress={showActions} hitSlop={8} style={styles.moreBtn}>
              <Ellipsis size={16} color="#666" strokeWidth={2.25} />
            </TouchableOpacity>
          )}
        </View>

        {comment.replies && comment.replies.length > 0 && (
          <View style={styles.replies}>
            {comment.replies.map((reply) => (
              <CommentItem
                key={reply.id}
                comment={reply}
                onEdit={onEdit}
                onDelete={onDelete}
                canModify={
                  reply.author?.id
                    ? comment.author?.id === reply.author?.id && canModify
                    : false
                }
                isReply
              />
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
  editedBadge: {
    color: '#555',
    fontSize: 11,
    fontStyle: 'italic',
  },
  replyBtn: {
    color: '#999',
    fontSize: 12,
    fontFamily: 'Archivo_600SemiBold',
  },
  moreBtn: {
    marginLeft: 'auto',
    padding: 2,
  },
  replies: {
    marginTop: 4,
  },
});
