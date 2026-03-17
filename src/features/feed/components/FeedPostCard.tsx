import { memo } from 'react';
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
function FeedPostCardInner({
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
  const isAudio = post.type === 'audio';

  const header = !isReel ? (
    <PostHeader
      author={post.author}
      isBookmarked={post.isBookmarked}
      onFollow={onFollow}
      onProfilePress={onProfilePress}
      onBookmark={onBookmark}
      onReport={onReport}
      onDelete={onDelete}
    />
  ) : null;

  const media = (
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
      onDelete={onDelete}
    />
  );

  return (
    <View style={styles.container}>
      {isAudio ? (
        <View style={styles.audioWrapper}>
          {header}
          {media}
        </View>
      ) : (
        <>
          {header}
          {media}
        </>
      )}
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

export const FeedPostCard = memo(FeedPostCardInner, (prev, next) => {
  const pi = prev.post.interactions;
  const ni = next.post.interactions;
  return (
    prev.post.id === next.post.id &&
    pi?.likesCount === ni?.likesCount &&
    pi?.commentsCount === ni?.commentsCount &&
    pi?.isLiked === ni?.isLiked &&
    pi?.isBookmarked === ni?.isBookmarked &&
    pi?.isReposted === ni?.isReposted &&
    prev.post.author?.isFollowing === next.post.author?.isFollowing &&
    prev.isVisible === next.isVisible
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    marginBottom: 16,
  },
  audioWrapper: {
    backgroundColor: '#1A1A1A',
  },
});
