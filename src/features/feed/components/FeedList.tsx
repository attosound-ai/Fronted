import { useCallback, useRef, useState, type ReactElement } from 'react';
import {
  FlatList,
  RefreshControl,
  ActivityIndicator,
  View,
  ScrollView,
  StyleSheet,
  type ViewToken,
} from 'react-native';

import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { cloudinaryUrl } from '@/lib/media/cloudinaryUrl';
import { COLORS, SPACING } from '@/constants/theme';
import { useFeed } from '../hooks/useFeed';
import { useEngagement } from '../hooks/useEngagement';
import { useFollowFeed } from '../hooks/useFollowFeed';
import { FeedPostCard } from './FeedPostCard';
import { CommentsSheet } from './comments/CommentsSheet';
import { ShareSheet } from './share/ShareSheet';
import { PLACEHOLDER_POSTS } from '../constants/placeholderPosts';
import type { FeedPost, PostAuthor, PostType } from '@/types/post';
import type { Post } from '@/types';

interface FeedListProps {
  ListHeaderComponent?: ReactElement | null;
}

/** Resolve post type from backend contentType or fall back to legacy heuristic. */
function resolvePostType(post: Post): PostType {
  if (post.contentType) return post.contentType as PostType;
  if (post.images && post.images.length > 0) return 'image';
  return 'text';
}

/** Map API Post → FeedPost so the feed cards can consume it. */
function toFeedPost(post: Post): FeedPost {
  const type = resolvePostType(post);
  const files = post.filePaths ?? post.images ?? [];

  return {
    id: post.id,
    type,
    author: {
      id: post.author.id,
      username: post.author.username,
      displayName: post.author.displayName,
      avatar: post.author.avatar,
      isFollowing: false,
    },
    images: type === 'image' ? files : undefined,
    audioUrl: type === 'audio' ? (cloudinaryUrl(files[0], 'original', 'raw') ?? undefined) : undefined,
    videoUrl: type === 'video' || type === 'reel' ? files[0] : undefined,
    thumbnailUrl: post.metadata?.thumbnailUrl,
    duration: post.metadata?.duration ? Number(post.metadata.duration) : undefined,
    description: post.textContent ?? post.content,
    likesCount: post.likesCount,
    commentsCount: post.commentsCount,
    sharesCount: post.sharesCount ?? 0,
    repostsCount: post.repostsCount ?? 0,
    isLiked: post.isLiked,
    isBookmarked: post.isBookmarked,
    isReposted: post.isReposted,
    createdAt: post.createdAt,
  };
}

/**
 * FeedList — Infinite-scroll list with placeholder posts at the bottom.
 *
 * Single Responsibility: Orchestrates list rendering only.
 * Open/Closed: Accepts ListHeaderComponent for extensibility.
 * Dependency Inversion: Uses hook abstraction (useFeed).
 */
export function FeedList({ ListHeaderComponent }: FeedListProps) {
  const { t } = useTranslation('feed');
  const {
    posts,
    isLoading,
    isRefreshing,
    isFetchingMore,
    hasMore,
    error,
    refresh,
    loadMore,
    toggleLike,
    deletePost,
  } = useFeed();

  const { toggleBookmark, toggleRepost } = useEngagement();
  const { toggleFollow, getIsFollowing } = useFollowFeed();

  // Video auto-play: track which post IDs are currently visible
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 });
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      setVisibleIds(new Set(viewableItems.map((v) => v.item?.id).filter(Boolean)));
    }
  );

  // Sheet state
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const [sharePost, setSharePost] = useState<FeedPost | null>(null);

  const handleProfilePress = useCallback((author: PostAuthor) => {
    router.push({
      pathname: '/user/[id]',
      params: {
        id: String(author.id),
        displayName: author.displayName,
        username: author.username,
        avatar: author.avatar ?? '',
        verified: author.isVerified ? '1' : '0',
      },
    });
  }, []);

  const feedPosts: FeedPost[] = [...posts.map(toFeedPost), ...PLACEHOLDER_POSTS].map((p) => ({
    ...p,
    author: { ...p.author, isFollowing: getIsFollowing(p.author.id, p.author.isFollowing) },
  }));

  const handleFollow = useCallback(
    (userId: number) => {
      toggleFollow(userId, getIsFollowing(userId, false));
    },
    [toggleFollow, getIsFollowing]
  );

  const renderPost = useCallback(
    ({ item }: { item: FeedPost }) => {
      const isPlaceholder = item.id.startsWith('placeholder-');
      return (
        <FeedPostCard
          post={item}
          isVisible={visibleIds.has(item.id)}
          onLike={isPlaceholder ? undefined : toggleLike}
          onFollow={isPlaceholder ? undefined : handleFollow}
          onComment={isPlaceholder ? undefined : () => setCommentsPostId(item.id)}
          onRepost={isPlaceholder ? undefined : () => toggleRepost(item.id)}
          onShare={isPlaceholder ? undefined : () => setSharePost(item)}
          onBookmark={isPlaceholder ? undefined : () => toggleBookmark(item.id)}
          onProfilePress={handleProfilePress}
          onDelete={isPlaceholder ? undefined : () => deletePost(item.id)}
        />
      );
    },
    [toggleLike, handleFollow, toggleRepost, toggleBookmark, handleProfilePress, visibleIds, deletePost]
  );

  const renderFooter = useCallback(() => {
    if (!isFetchingMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator color={COLORS.white} />
      </View>
    );
  }, [isFetchingMore]);

  const handleEndReached = useCallback(() => {
    if (hasMore && !isFetchingMore) {
      loadMore();
    }
  }, [hasMore, isFetchingMore, loadMore]);

  if (isLoading && posts.length === 0) {
    return (
      <View style={styles.loading}>
        {ListHeaderComponent}
        <ActivityIndicator size="large" color={COLORS.white} />
      </View>
    );
  }

  if (error && posts.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={styles.error}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={COLORS.white}
          />
        }
      >
        {ListHeaderComponent}
        <Text variant="h2">{t('list.errorLoadTitle')}</Text>
        <Text variant="body" style={styles.errorText}>
          {error.message}
        </Text>
        <Text variant="body" style={styles.errorText}>
          {t('list.errorLoadRetry')}
        </Text>
      </ScrollView>
    );
  }

  return (
    <>
      <FlatList
        data={feedPosts}
        renderItem={renderPost}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={ListHeaderComponent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={COLORS.white}
          />
        }
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderFooter}
        showsVerticalScrollIndicator={false}
        viewabilityConfig={viewabilityConfig.current}
        onViewableItemsChanged={onViewableItemsChanged.current}
      />

      {commentsPostId && (
        <CommentsSheet
          visible
          onClose={() => setCommentsPostId(null)}
          postId={commentsPostId}
        />
      )}

      {sharePost && (
        <ShareSheet visible onClose={() => setSharePost(null)} post={sharePost} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  error: {
    flex: 1,
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  errorText: {
    color: COLORS.gray[500],
    marginTop: SPACING.sm,
  },
  footer: {
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
});
