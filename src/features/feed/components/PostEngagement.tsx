import { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { LinkedText } from './LinkedText';
import { formatCount, formatRelativeTime } from '@/utils/formatters';
import type { FeedPost } from '@/types/post';

interface PostEngagementProps {
  post: FeedPost;
  onViewComments?: () => void;
}

export function PostEngagement({ post, onViewComments }: PostEngagementProps) {
  const { t } = useTranslation('feed');
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.container}>
      {/* Caption — omitted for text posts since PoemMedia already renders the content */}
      {post.type !== 'text' && post.description && (
        <Text
          variant="body"
          style={styles.caption}
          numberOfLines={expanded ? undefined : 2}
          onPress={() => setExpanded((v) => !v)}
        >
          <Text variant="body" style={styles.captionUsername}>
            {post.author.username}
          </Text>
          {'  '}
          <LinkedText style={styles.caption}>{post.description}</LinkedText>
        </Text>
      )}

      {/* Comments */}
      {post.commentsCount > 0 && (
        <TouchableOpacity onPress={onViewComments} activeOpacity={0.7}>
          <Text variant="body" style={styles.viewComments} maxFontSizeMultiplier={1.1}>
            {t('post.viewAllComments', {
              count: formatCount(post.commentsCount),
            } as Record<string, unknown>)}
          </Text>
        </TouchableOpacity>
      )}

      {/* Timestamp */}
      <Text variant="caption" style={styles.timestamp} maxFontSizeMultiplier={1.1}>
        {formatRelativeTime(post.createdAt)}
        {post.isEdited && ' · edited'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    gap: 4,
    paddingBottom: 12,
  },
  caption: {
    color: '#FFF',
    fontSize: 14,
    lineHeight: 20,
  },
  captionUsername: {
    fontFamily: 'Archivo_600SemiBold',
  },
  viewComments: {
    color: '#999',
    fontSize: 14,
  },
  timestamp: {
    color: '#666',
    fontSize: 11,
    marginTop: 2,
  },
});
