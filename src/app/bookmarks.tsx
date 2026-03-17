import { useCallback, useState } from 'react';
import {
  View,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { FeedPostCard } from '@/features/feed/components/FeedPostCard';
import { useBookmarks } from '@/features/feed/hooks/useBookmarks';
import { useEngagement } from '@/features/feed/hooks/useEngagement';
import { CommentsSheet } from '@/features/feed/components/comments/CommentsSheet';
import { ShareSheet } from '@/features/feed/components/share/ShareSheet';
import type { FeedPost, PostAuthor, PostType } from '@/types/post';
import type { Post } from '@/types';

// ---------------------------------------------------------------------------
// Post → FeedPost helpers (mirrors FeedList.tsx)
// ---------------------------------------------------------------------------

function resolvePostType(post: Post): PostType {
  if (post.contentType) return post.contentType as PostType;
  if (post.images && post.images.length > 0) return 'image';
  return 'text';
}

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
    audioUrl: type === 'audio' ? files[0] : undefined,
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

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function BookmarksScreen() {
  const {
    bookmarks,
    isLoading,
    isRefreshing,
    refresh,
    loadMore,
    isFetchingMore,
    hasMore,
  } = useBookmarks();

  const { toggleBookmark, toggleRepost } = useEngagement();

  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const [sharePost, setSharePost] = useState<FeedPost | null>(null);

  const feedPosts: FeedPost[] = bookmarks.map(toFeedPost);

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

  const renderItem = useCallback(
    ({ item }: { item: FeedPost }) => (
      <FeedPostCard
        post={item}
        onComment={() => setCommentsPostId(item.id)}
        onRepost={() => toggleRepost(item.id)}
        onShare={() => setSharePost(item)}
        onBookmark={() => toggleBookmark(item.id)}
        onProfilePress={handleProfilePress}
      />
    ),
    [toggleRepost, toggleBookmark, handleProfilePress]
  );

  const renderFooter = useCallback(() => {
    if (!isFetchingMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator color="#FFF" />
      </View>
    );
  }, [isFetchingMore]);

  const handleEndReached = useCallback(() => {
    if (hasMore && !isFetchingMore) {
      loadMore();
    }
  }, [hasMore, isFetchingMore, loadMore]);

  const renderEmpty = useCallback(() => {
    if (isLoading) return null;
    return (
      <View style={styles.empty}>
        <Ionicons name="bookmark-outline" size={52} color="#444" />
        <Text style={styles.emptyTitle}>No saved posts yet</Text>
        <Text style={styles.emptySubtitle}>
          Tap the bookmark icon on any post to save it here.
        </Text>
      </View>
    );
  }, [isLoading]);

  return (
    <View style={styles.container}>
      {isLoading && bookmarks.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFF" />
        </View>
      ) : (
        <FlatList
          data={feedPosts}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={refresh}
              tintColor="#FFF"
            />
          }
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={renderEmpty}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={
            feedPosts.length === 0 ? styles.emptyContainer : undefined
          }
        />
      )}

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 18,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: '#888888',
    fontFamily: 'Archivo_400Regular',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
});
