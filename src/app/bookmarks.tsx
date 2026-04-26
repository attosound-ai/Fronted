import { useCallback, useState } from 'react';
import {
  View,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FeedSkeleton } from '@/components/ui/Skeleton';
import { router, type Href } from 'expo-router';
import { Bookmark, ChevronLeft } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { useAuthStore } from '@/stores/authStore';
import { FeedPostCard } from '@/features/feed/components/FeedPostCard';
import { useBookmarks } from '@/features/feed/hooks/useBookmarks';
import { useInteractions } from '@/features/feed/hooks/useInteractions';
import { feedService } from '@/features/feed/services/feedService';
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
      isFollowing: post.isFollowingAuthor ?? false,
      role: post.author.role,
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
    isFollowingAuthor: post.isFollowingAuthor,
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

  const { toggleLike, toggleBookmark, toggleRepost, trackShare } = useInteractions();

  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const [sharePost, setSharePost] = useState<FeedPost | null>(null);

  const feedPosts: FeedPost[] = bookmarks.map(toFeedPost);

  const currentUserId = useAuthStore((s) => s.user?.id);

  const handleDeletePost = useCallback(
    (postId: string) => {
      Alert.alert('Delete Post', 'Are you sure?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await feedService.deletePost(postId);
              refresh();
            } catch {
              Alert.alert('Error', 'Failed to delete the post.');
            }
          },
        },
      ]);
    },
    [refresh]
  );

  const handleProfilePress = useCallback((author: PostAuthor) => {
    if (author.id === currentUserId) {
      router.navigate('/(tabs)/profile');
      return;
    }
    router.navigate({
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
        onLike={() => toggleLike(item.id)}
        onComment={() => setCommentsPostId(item.id)}
        onRepost={() => toggleRepost(item.id)}
        onShare={() => setSharePost(item)}
        onBookmark={() => toggleBookmark(item.id)}
        onEdit={
          String(item.author.id) === String(currentUserId)
            ? () =>
                router.push({
                  pathname: '/edit-post',
                  params: { postId: item.id },
                } as Href)
            : undefined
        }
        onDelete={
          String(item.author.id) === String(currentUserId)
            ? () => handleDeletePost(item.id)
            : undefined
        }
        onProfilePress={handleProfilePress}
      />
    ),
    [toggleLike, toggleRepost, toggleBookmark, handleProfilePress]
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
        <Bookmark size={52} color="#444" strokeWidth={2.25} />
        <Text style={styles.emptyTitle}>No saved posts yet</Text>
        <Text style={styles.emptySubtitle}>
          Tap the bookmark icon on any post to save it here.
        </Text>
      </View>
    );
  }, [isLoading]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ChevronLeft size={28} color="#FFFFFF" strokeWidth={2.25} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Saved</Text>
        <View style={{ width: 28 }} />
      </View>
      {isLoading && bookmarks.length === 0 ? (
        <FeedSkeleton />
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
        <ShareSheet
          visible
          onClose={() => setSharePost(null)}
          post={sharePost}
          onShareTracked={() => trackShare(sharePost.id)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 17,
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
