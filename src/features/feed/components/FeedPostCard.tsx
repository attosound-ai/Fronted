import { View, StyleSheet } from 'react-native';
import type { FeedPost, PostAuthor } from '@/types/post';
import { PostHeader } from './PostHeader';
import { PostMedia } from './media/PostMedia';
import { PostActions } from './PostActions';
import { PostEngagement } from './PostEngagement';

interface FeedPostCardProps {
  post: FeedPost;
  onLike?: (postId: string) => void;
  onFollow?: (userId: number) => void;
  onComment?: () => void;
  onShare?: () => void;
  onBookmark?: () => void;
  onProfilePress?: (author: PostAuthor) => void;
  onShowSupport?: () => void;
  onReport?: () => void;
}

/**
 * FeedPostCard — Instagram-style post layout.
 *
 * Composition: PostHeader → PostMedia → PostActions → PostEngagement
 */
export function FeedPostCard({
  post,
  onLike,
  onFollow,
  onComment,
  onShare,
  onBookmark,
  onProfilePress,
  onShowSupport,
  onReport,
}: FeedPostCardProps) {
  const handleDoubleTapLike = () => {
    if (!post.isLiked) {
      onLike?.(post.id);
    }
  };

  return (
    <View style={styles.container}>
      <PostHeader
        author={post.author}
        onFollow={onFollow}
        onProfilePress={onProfilePress}
        onBookmark={onBookmark}
        onReport={onReport}
      />
      <PostMedia post={post} onDoubleTap={handleDoubleTapLike} />
      <PostActions
        post={post}
        onLike={onLike}
        onComment={onComment}
        onShare={onShare}
        onShowSupport={onShowSupport}
      />
      <PostEngagement post={post} onViewComments={onComment} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    marginBottom: 8,
  },
});
