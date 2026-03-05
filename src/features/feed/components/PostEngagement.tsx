import { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/Text';
import { formatCount, formatRelativeTime } from '@/utils/formatters';
import type { FeedPost } from '@/types/post';

interface PostEngagementProps {
  post: FeedPost;
  onViewComments?: () => void;
}

export function PostEngagement({ post, onViewComments }: PostEngagementProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.container}>
      {/* Caption */}
      {post.description && (
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
          {post.description}
        </Text>
      )}

      {/* Comments */}
      {post.commentsCount > 0 && (
        <TouchableOpacity onPress={onViewComments} activeOpacity={0.7}>
          <Text variant="body" style={styles.viewComments}>
            View all {formatCount(post.commentsCount)} comments
          </Text>
        </TouchableOpacity>
      )}

      {/* Timestamp */}
      <Text variant="caption" style={styles.timestamp}>
        {formatRelativeTime(post.createdAt)}
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
    fontFamily: 'Poppins_600SemiBold',
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
