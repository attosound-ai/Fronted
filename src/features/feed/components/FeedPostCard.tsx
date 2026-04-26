import { memo, useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { GOLD } from '@/constants/gold';
import { Text } from '@/components/ui/Text';
import { useAuthStore } from '@/stores/authStore';
import type { FeedPost, PostAuthor } from '@/types/post';
import { PostHeader } from './PostHeader';
import { PostMedia } from './media/PostMedia';
import { PostActions } from './PostActions';
import { PostEngagement } from './PostEngagement';
import { InteractorsBottomSheet, type InteractionType } from './InteractorsBottomSheet';

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
  onEdit?: () => void;
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
  onEdit,
  onDelete,
}: FeedPostCardProps) {
  const [interactorsType, setInteractorsType] = useState<InteractionType | null>(null);

  const handleDoubleTapLike = () => {
    if (!post.isLiked) {
      onLike?.(post.id);
    }
  };

  const handleShowInteractors = useCallback((type: InteractionType) => {
    import('@/lib/haptics/hapticService').then(({ haptic }) => haptic('light'));
    setInteractorsType(type);
  }, []);

  const { t } = useTranslation('feed');
  const currentUserId = useAuthStore((s) => s.user?.id);
  const isOwnPost =
    currentUserId !== undefined && String(post.author.id) === String(currentUserId);
  const isReel = post.type === 'reel';
  const isCreatorPost = post.author.role === 'creator';
  const isAudio = post.type === 'audio';

  const header = !isReel ? (
    <PostHeader
      author={post.author}
      isBookmarked={post.isBookmarked}
      onFollow={onFollow}
      onProfilePress={onProfilePress}
      onBookmark={onBookmark}
      onReport={onReport}
      onEdit={onEdit}
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
      {isCreatorPost ? (
        <View style={styles.creatorPostShell}>
          <LinearGradient
            colors={[
              GOLD.shadowDeep,
              GOLD.base,
              GOLD.highlight,
              GOLD.base,
              GOLD.shadowDeep,
            ]}
            locations={[0, 0.25, 0.5, 0.75, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.creatorTopBorder}
          />
          <View
            style={[
              styles.creatorPostWrapper,
              isAudio ? styles.creatorAudioPostWrapper : null,
            ]}
          >
            {header}
            {media}
          </View>
          <LinearGradient
            colors={[
              GOLD.shadowDeep,
              GOLD.base,
              GOLD.highlight,
              GOLD.base,
              GOLD.shadowDeep,
            ]}
            locations={[0, 0.25, 0.5, 0.75, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.creatorBottomBorder}
          />
        </View>
      ) : (
        <>
          {isReel && !isOwnPost && !post.author.isFollowing && (
            <Text variant="small" style={styles.suggestedLabel}>
              {t('post.suggestedForYou')}
            </Text>
          )}
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
        onShowInteractors={handleShowInteractors}
      />
      <PostEngagement post={post} onViewComments={onComment} />
      {interactorsType && (
        <InteractorsBottomSheet
          visible={!!interactorsType}
          onClose={() => setInteractorsType(null)}
          postId={post.id}
          type={interactorsType}
        />
      )}
    </View>
  );
}

export const FeedPostCard = memo(FeedPostCardInner, (prev, next) => {
  return (
    prev.post.id === next.post.id &&
    prev.post.description === next.post.description &&
    prev.post.likesCount === next.post.likesCount &&
    prev.post.commentsCount === next.post.commentsCount &&
    prev.post.sharesCount === next.post.sharesCount &&
    prev.post.repostsCount === next.post.repostsCount &&
    prev.post.isLiked === next.post.isLiked &&
    prev.post.isBookmarked === next.post.isBookmarked &&
    prev.post.isReposted === next.post.isReposted &&
    prev.post.author?.isFollowing === next.post.author?.isFollowing &&
    prev.isVisible === next.isVisible
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
  },
  suggestedLabel: {
    color: '#888',
    fontSize: 11,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
  },
  creatorPostShell: {
    backgroundColor: '#000',
  },
  creatorPostWrapper: {
    backgroundColor: '#000',
  },
  creatorAudioPostWrapper: {
    backgroundColor: '#1A1A1A',
  },
  creatorTopBorder: {
    height: 1,
  },
  creatorBottomBorder: {
    height: 1,
  },
});
