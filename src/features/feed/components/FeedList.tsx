import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  DeviceEventEmitter,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  View,
  ScrollView,
  StyleSheet,
  type ViewToken,
} from 'react-native';

import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Text } from '@/components/ui/Text';
import { cloudinaryUrl } from '@/lib/media/cloudinaryUrl';
import { COLORS, SPACING } from '@/constants/theme';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { useFeed } from '../hooks/useFeed';
import { useInteractions } from '../hooks/useInteractions';
import { useFollowFeed } from '../hooks/useFollowFeed';
import { useFollowStore } from '@/stores/followStore';
import { useAuthStore } from '@/stores/authStore';
import { FeedPostCard } from './FeedPostCard';
import { AdCard } from './AdCard';
import { CommentsSheet } from './comments/CommentsSheet';
import { ShareSheet } from './share/ShareSheet';
import { ComingSoonModal } from '@/components/ui/ComingSoonModal';
import { Heart } from 'lucide-react-native';
import { FeedSkeleton } from '@/components/ui/Skeleton';
import { useAds } from '../hooks/useAds';
import { injectAds } from '../utils/injectAds';
import { useFeedFilterStore } from '@/stores/feedFilterStore';
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
    deletePost,
  } = useFeed();

  const { toggleLike, toggleBookmark, toggleRepost, trackShare } = useInteractions();
  const { toggleFollow, getIsFollowing } = useFollowFeed();
  const ads = useAds();
  const feedFilters = useFeedFilterStore((s) => s.filters);
  const followedUsers = useFollowStore((s) => s.followedUsers);
  const hydrateFromApi = useFollowStore((s) => s.hydrateFromApi);
  const qc = useQueryClient();

  const flatListRef = useRef<FlatList<FeedPost>>(null);

  // Hydrate follow store + seed profile cache from feed data
  useEffect(() => {
    if (posts.length === 0) return;
    const entries = posts
      .filter((p) => p.isFollowingAuthor !== undefined)
      .map((p) => ({ userId: Number(p.author.id), isFollowing: p.isFollowingAuthor! }));
    if (entries.length > 0) hydrateFromApi(entries);
  }, [posts, hydrateFromApi, qc]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('feedScrollToTop', () => {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
    return () => sub.remove();
  }, []);

  // Video auto-play: track visible post IDs.
  // Ref holds the truth (read during render). State update is deferred via
  // InteractionManager so it never interrupts scroll animations.
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const visibleIdsRef = useRef<Set<string>>(new Set());
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 });
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const next = new Set(viewableItems.map((v) => v.item?.id).filter(Boolean));
      visibleIdsRef.current = next;
      // Defer state update so it never interrupts scroll momentum
      setTimeout(() => setVisibleIds(next), 0);
    }
  );

  // Sheet state
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const [sharePost, setSharePost] = useState<FeedPost | null>(null);
  const [supportModalVisible, setSupportModalVisible] = useState(false);

  const currentUserId = useAuthStore((s) => s.user?.id);

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

  const feedPosts = useMemo(() => {
    let realPosts = posts.map(toFeedPost).map((p) => ({
      ...p,
      author: {
        ...p.author,
        isFollowing: getIsFollowing(p.author.id, p.author.isFollowing),
      },
    }));

    // Apply filters
    if (feedFilters.creatorsOnly) {
      realPosts = realPosts.filter((p) => p.author.role === 'creator');
    }
    if (feedFilters.contentTypes.length > 0) {
      realPosts = realPosts.filter((p) => feedFilters.contentTypes.includes(p.type));
    }

    return injectAds(realPosts, ads);
  }, [posts, getIsFollowing, followedUsers, feedFilters]);

  const handleFollow = useCallback(
    (userId: number) => {
      toggleFollow(userId, getIsFollowing(userId, false));
    },
    [toggleFollow, getIsFollowing]
  );

  const renderPost = useCallback(
    ({ item }: { item: FeedPost }) => {
      if (item.isAd) {
        return (
          <AdCard
            post={item}
            isVisible={visibleIdsRef.current.has(item.id)}
            onComment={() => setCommentsPostId(item.id)}
            onShare={() => setSharePost(item)}
          />
        );
      }
      return (
        <FeedPostCard
          post={item}
          isVisible={visibleIdsRef.current.has(item.id)}
          onLike={toggleLike}
          onFollow={handleFollow}
          onComment={() => setCommentsPostId(item.id)}
          onRepost={() => toggleRepost(item.id)}
          onShare={() => setSharePost(item)}
          onBookmark={() => toggleBookmark(item.id)}
          onProfilePress={handleProfilePress}
          onShowSupport={() => setSupportModalVisible(true)}
          onEdit={() =>
            router.push({ pathname: '/edit-post', params: { postId: item.id } } as Href)
          }
          onDelete={() => deletePost(item.id)}
        />
      );
    },
    [
      toggleLike,
      handleFollow,
      toggleRepost,
      toggleBookmark,
      handleProfilePress,
      deletePost,
    ]
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

  const keyExtractor = useCallback((item: FeedPost) => item.id, []);

  const refreshCtrl = useMemo(
    () => (
      <RefreshControl
        refreshing={isRefreshing}
        onRefresh={refresh}
        tintColor={COLORS.white}
      />
    ),
    [isRefreshing, refresh]
  );

  if (isLoading && posts.length === 0) {
    return (
      <ScrollView style={styles.loading} showsVerticalScrollIndicator={false}>
        {ListHeaderComponent}
        <FeedSkeleton />
      </ScrollView>
    );
  }

  if (error && posts.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={styles.errorContainer}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={COLORS.white}
          />
        }
      >
        {ListHeaderComponent}
        <View style={styles.errorContent}>
          <Text variant="h2">{t('list.errorLoadTitle')}</Text>
          <Text variant="body" style={styles.errorText}>
            {error.message}
          </Text>
          <Text variant="body" style={styles.errorText}>
            {t('list.errorLoadRetry')}
          </Text>
        </View>
      </ScrollView>
    );
  }

  const ItemSeparator = () => <View style={styles.separator} />;

  return (
    <>
      <FlatList
        ref={flatListRef}
        data={feedPosts}
        renderItem={renderPost}
        keyExtractor={keyExtractor}
        ListHeaderComponent={ListHeaderComponent}
        refreshControl={refreshCtrl}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderFooter}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        directionalLockEnabled
        extraData={visibleIds}
        viewabilityConfig={viewabilityConfig.current}
        onViewableItemsChanged={onViewableItemsChanged.current}
        removeClippedSubviews
        maxToRenderPerBatch={5}
        windowSize={7}
        initialNumToRender={5}
        updateCellsBatchingPeriod={100}
        ItemSeparatorComponent={ItemSeparator}
      />

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

      <ComingSoonModal
        visible={supportModalVisible}
        onClose={() => setSupportModalVisible(false)}
        icon={Heart}
        title={t('comingSoon.title', { ns: 'common' })}
        description={t('comingSoon.showSupport', { ns: 'common' })}
      />
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
  },
  errorContainer: {
    flexGrow: 1,
  },
  errorContent: {
    flex: 1,
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  errorText: {
    color: COLORS.gray[500],
    marginTop: SPACING.sm,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#222',
    marginVertical: 8,
  },
  footer: {
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
});
