import {
  View,
  TouchableOpacity,
  ActionSheetIOS,
  Platform,
  Alert,
  StyleSheet,
} from 'react-native';
import { AlertCircle, Ellipsis } from 'lucide-react-native';
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
  /** A comment that could not be sent: send it again, or throw it away. */
  onRetry?: (commentId: string) => void;
  onDiscard?: (commentId: string) => void;
  canModify?: boolean;
  isReply?: boolean;
}

export function CommentItem({
  comment,
  onReply,
  onEdit,
  onDelete,
  onRetry,
  onDiscard,
  canModify,
  isReply,
}: CommentItemProps) {
  const { t } = useTranslation(['feed', 'common']);
  // Only on this phone so far: on its way, or failed and waiting.
  const sending = comment.status === 'sending';
  const failed = comment.status === 'failed';
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
        {
          text: t('comments.edit'),
          onPress: () => onEdit?.(comment.id, comment.comment),
        },
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
    <View
      style={[
        styles.container,
        isReply && styles.replyContainer,
        (sending || failed) && styles.pending,
      ]}
    >
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
        {failed ? (
          // The comment stays with what was typed and says what happened, the
          // way Instagram does. It used to vanish without a word.
          <View style={styles.failedRow}>
            <AlertCircle size={13} color={FAILED} strokeWidth={2.25} />
            <Text variant="caption" style={styles.failedText}>
              {t('comments.notSent')}
            </Text>
            <TouchableOpacity
              onPress={() => onRetry?.(comment.id)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('comments.retry')}
            >
              <Text variant="caption" style={styles.failedAction}>
                {t('comments.retry')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onDiscard?.(comment.id)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('comments.discard')}
            >
              <Text variant="caption" style={styles.discardAction}>
                {t('comments.discard')}
              </Text>
            </TouchableOpacity>
          </View>
        ) : sending ? (
          <View style={styles.meta}>
            <Text variant="caption" style={styles.time}>
              {t('comments.posting')}
            </Text>
          </View>
        ) : (
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
        )}

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

/** The red of a comment that was not sent. */
const FAILED = '#FF6B6B';

const styles = StyleSheet.create({
  // On its way or not sent: quieter than a comment the server has.
  pending: { opacity: 0.72 },
  failedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  failedText: { color: FAILED },
  failedAction: { color: '#FFFFFF', fontWeight: '600' },
  discardAction: { color: '#8A8A8A' },
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
