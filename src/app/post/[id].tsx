import { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  Alert,
  StyleSheet,
  type ViewToken,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { useLocalSearchParams, router, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { Text } from '@/components/ui/Text';
import { useAuthStore } from '@/stores/authStore';
import { FeedPostCard } from '@/features/feed/components/FeedPostCard';
import { CommentsSheet } from '@/features/feed/components/comments/CommentsSheet';
import { ShareSheet } from '@/features/feed/components/share/ShareSheet';
import { useInteractions } from '@/features/feed/hooks/useInteractions';
import { useFollowFeed } from '@/features/feed/hooks/useFollowFeed';
import {
  usePostFeed,
  type PostFeedSource,
} from '@/features/feed/hooks/usePostFeed';
import { feedService } from '@/features/feed/services/feedService';
import { cloudinaryUrl } from '@/lib/media/cloudinaryUrl';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { Post } from '@/types';
import type { FeedPost, PostAuthor, PostType } from '@/types/post';

// ── Post → FeedPost conversion ───────────────────────────────────────────────

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
    images:
      type === 'image' ? files.map((f) => cloudinaryUrl(f, 'feed') ?? f) : undefined,
    audioUrl:
      type === 'audio'
        ? (cloudinaryUrl(files[0], 'original', 'raw') ?? undefined)
        : undefined,
    videoUrl:
      type === 'video' || type === 'reel'
        ? (cloudinaryUrl(files[0], 'video_original', 'video') ?? files[0])
        : undefined,
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
    isEdited: post.updatedAt !== post.createdAt && !!post.updatedAt,
    isFollowingAuthor: post.isFollowingAuthor,
  };
}

const VALID_SOURCES: readonly PostFeedSource[] = [
  'profile',
  'search',
  'bookmarks',
  'feed',
  'single',
];

function parseSource(raw: string | undefined): PostFeedSource {
  if (raw && (VALID_SOURCES as readonly string[]).includes(raw)) {
    return raw as PostFeedSource;
  }
  return 'single';
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function PostDetailScreen() {
  const params = useLocalSearchParams<{
    id: string;
    source?: string;
    sourceUserId?: string;
    sourceQuery?: string;
    sourceContentType?: string;
  }>();
  const { id, sourceQuery, sourceContentType } = params;
  const source = parseSource(params.source);
  const sourceUserId = params.sourceUserId ? Number(params.sourceUserId) : undefined;

  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const [sharePost, setSharePost] = useState<FeedPost | null>(null);
  const { toggleLike, toggleBookmark, toggleRepost, trackShare } = useInteractions();
  const { toggleFollow, getIsFollowing } = useFollowFeed();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const queryClient = useQueryClient();

  const {
    posts,
    isLoading,
    isFetchingMore,
    hasMore,
    loadMore,
    refresh,
    isRefreshing,
  } = usePostFeed({
    initialPostId: id,
    source,
    sourceUserId,
    sourceQuery,
    sourceContentType,
  });

  const feedPosts = useMemo<FeedPost[]>(
    () =>
      posts.map((p) => {
        const base = toFeedPost(p);
        return {
          ...base,
          author: {
            ...base.author,
            isFollowing: getIsFollowing(base.author.id, base.author.isFollowing),
          },
        };
      }),
    [posts, getIsFollowing]
  );

  // ── viewability (drives video/audio autoplay per item) ────────────────────
  const visibleIdsRef = useRef<Set<string>>(new Set([id]));
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set([id]));
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 });
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const next = new Set(
        viewableItems.map((v) => (v.item as FeedPost | null)?.id).filter(Boolean) as string[]
      );
      visibleIdsRef.current = next;
      setTimeout(() => setVisibleIds(next), 0);
    }
  );

  // ── handlers ──────────────────────────────────────────────────────────────
  const handleFollow = useCallback(
    (userId: number) => toggleFollow(userId, getIsFollowing(userId, false)),
    [toggleFollow, getIsFollowing]
  );

  const handleProfilePress = useCallback(
    (author: PostAuthor) => {
      if (author.id === currentUserId) {
        router.navigate('/(tabs)/profile');
        return;
      }
      router.navigate({
        pathname: '/user/[id]',
        params: {
          id: String(author.id),
          username: author.username,
          avatar: author.avatar ?? '',
          verified: author.isVerified ? '1' : '0',
        },
      });
    },
    [currentUserId]
  );

  const handleDelete = useCallback(
    (postId: string) => {
      Alert.alert('Delete Post', 'Are you sure you want to delete this post?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await feedService.deletePost(postId);
              queryClient.invalidateQueries({ queryKey: QUERY_KEYS.FEED.ALL });
              if (currentUserId) {
                queryClient.invalidateQueries({
                  queryKey: QUERY_KEYS.FEED.USER_POSTS(currentUserId),
                });
              }
              queryClient.removeQueries({ queryKey: QUERY_KEYS.FEED.POST(postId) });
              router.back();
            } catch {
              Alert.alert('Error', 'Failed to delete the post. Please try again.');
            }
          },
        },
      ]);
    },
    [currentUserId, queryClient]
  );

  const renderItem = useCallback(
    ({ item }: { item: FeedPost }) => {
      const isOwn = String(item.author.id) === String(currentUserId);
      return (
        <FeedPostCard
          post={item}
          isVisible={visibleIdsRef.current.has(item.id)}
          onLike={() => toggleLike(item.id)}
          onFollow={handleFollow}
          onComment={() => setCommentsPostId(item.id)}
          onRepost={() => toggleRepost(item.id)}
          onShare={() => setSharePost(item)}
          onBookmark={() => toggleBookmark(item.id)}
          onProfilePress={handleProfilePress}
          onEdit={
            isOwn
              ? () =>
                  router.push({
                    pathname: '/edit-post',
                    params: { postId: item.id },
                  } as Href)
              : undefined
          }
          onDelete={isOwn ? () => handleDelete(item.id) : undefined}
        />
      );
    },
    [
      currentUserId,
      toggleLike,
      handleFollow,
      toggleRepost,
      toggleBookmark,
      handleProfilePress,
      handleDelete,
    ]
  );

  const keyExtractor = useCallback((item: FeedPost) => item.id, []);

  const handleEndReached = useCallback(() => {
    if (hasMore && !isFetchingMore) loadMore();
  }, [hasMore, isFetchingMore, loadMore]);

  const renderFooter = useCallback(() => {
    if (!isFetchingMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator color="#FFF" />
      </View>
    );
  }, [isFetchingMore]);

  const ItemSeparator = useCallback(
    () => <View style={styles.separator} />,
    []
  );

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ChevronLeft size={28} color="#FFFFFF" strokeWidth={2.25} />
        </TouchableOpacity>
        <Text variant="h3" style={styles.headerTitle}>
          Post
        </Text>
        <View style={{ width: 28 }} />
      </View>

      {isLoading && feedPosts.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#FFF" />
        </View>
      ) : feedPosts.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>Couldn't load this post.</Text>
        </View>
      ) : (
        <FlatList
          data={feedPosts}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.6}
          ListFooterComponent={renderFooter}
          ItemSeparatorComponent={ItemSeparator}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={refresh}
              tintColor="#FFF"
            />
          }
          // Virtualization tuning — mirrors FeedList for consistency.
          removeClippedSubviews
          maxToRenderPerBatch={5}
          windowSize={7}
          initialNumToRender={3}
          updateCellsBatchingPeriod={100}
          scrollEventThrottle={16}
          directionalLockEnabled
          // Viewability for autoplay of videos/audio
          viewabilityConfig={viewabilityConfig.current}
          onViewableItemsChanged={onViewableItemsChanged.current}
          extraData={visibleIds}
          contentContainerStyle={styles.listContent}
        />
      )}

      {commentsPostId && (
        <CommentsSheet
          postId={commentsPostId}
          visible
          onClose={() => setCommentsPostId(null)}
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
    backgroundColor: '#000',
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
  },
  listContent: {
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: '#666',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#222',
    marginVertical: 8,
  },
  footer: {
    paddingVertical: 24,
    alignItems: 'center',
  },
});
