import { useCallback, type ReactElement } from 'react';
import {
  FlatList,
  RefreshControl,
  ActivityIndicator,
  View,
  ScrollView,
  StyleSheet,
} from 'react-native';

import { Text } from '@/components/ui/Text';
import { COLORS, SPACING } from '@/constants/theme';
import { useFeed } from '../hooks/useFeed';
import { FeedPostCard } from './FeedPostCard';
import { PLACEHOLDER_POSTS } from '../constants/placeholderPosts';
import type { FeedPost } from '@/types/post';
import type { Post } from '@/types';

interface FeedListProps {
  ListHeaderComponent?: ReactElement | null;
}

/** Map the legacy API Post → FeedPost so the new cards can consume it. */
function toFeedPost(post: Post): FeedPost {
  return {
    id: post.id,
    type: post.images.length > 0 ? 'image' : 'text',
    author: {
      id: post.author.id,
      username: post.author.username,
      displayName: post.author.displayName,
      avatar: post.author.avatar,
      isFollowing: false,
    },
    images: post.images,
    description: post.content,
    likesCount: post.likesCount,
    commentsCount: post.commentsCount,
    sharesCount: 0,
    repostsCount: 0,
    isLiked: post.isLiked,
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
  } = useFeed();

  const handleProfilePress = useCallback((_userId: number) => {
    // TODO: Navigate to user profile
  }, []);

  const feedPosts: FeedPost[] = [...posts.map(toFeedPost), ...PLACEHOLDER_POSTS];

  const renderPost = useCallback(
    ({ item }: { item: FeedPost }) => (
      <FeedPostCard post={item} onLike={toggleLike} onProfilePress={handleProfilePress} />
    ),
    [toggleLike, handleProfilePress]
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
        <Text variant="h2">Error al cargar</Text>
        <Text variant="body" style={styles.errorText}>
          {error.message}
        </Text>
        <Text variant="body" style={styles.errorText}>
          Desliza hacia abajo para reintentar
        </Text>
      </ScrollView>
    );
  }

  return (
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
    />
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
