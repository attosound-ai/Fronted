import { View, StyleSheet } from 'react-native';
import type { FeedPost, PostAuthor } from '@/types/post';
import { PostHeader } from './PostHeader';
import { PostMedia } from './media/PostMedia';
import { PostActions } from './PostActions';
import { PostEngagement } from './PostEngagement';

interface FeedPostCardProps {
  post: FeedPost;
  isVisible?: boolean;
  onLike?: (postId: string) => void;
  onFollow?: (userId: number) => void;
  onComment?: () => void;
  onRepost?: () => void;
  onShare?: () => void;
  onBookmark?: () => void;
  onProfilePress?: (author: PostAuthor) => void;
  onShowSupport?: () => void;
  onReport?: () => void;
  onDelete?: () => void;
}

/**
 * FeedPostCard — Instagram-style post layout.
 *
 * Composition: PostHeader → PostMedia → PostActions → PostEngagement
 */
export function FeedPostCard({
  post,
  isVisible,
  onLike,
  onFollow,
  onComment,
  onRepost,
  onShare,
  onBookmark,
  onProfilePress,
  onShowSupport,
  onReport,
  onDelete,
}: FeedPostCardProps) {
  const handleDoubleTapLike = () => {
    if (!post.isLiked) {
      onLike?.(post.id);
    }
  };

  const isReel = post.type === 'reel';

  return (
    <View style={styles.container}>
      {!isReel && (
        <PostHeader
          author={post.author}
          isBookmarked={post.isBookmarked}
          onFollow={onFollow}
          onProfilePress={onProfilePress}
          onBookmark={onBookmark}
          onReport={onReport}
          onDelete={onDelete}
        />
      )}
      <PostMedia
        post={post}
        onDoubleTap={handleDoubleTapLike}
        isVisible={isVisible}
        onLike={onLike}
        onComment={onComment}
        onShare={onShare}
        onProfilePress={onProfilePress}
        onFollow={onFollow}
        onBookmark={onBookmark}
        onReport={onReport}
      />
      <PostActions
        post={post}
        onLike={onLike}
        onComment={onComment}
        onRepost={onRepost}
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
