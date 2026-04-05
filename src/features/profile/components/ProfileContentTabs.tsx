/**
 * ProfileContentTabs
 *
 * Instagram-style two-tab grid for a user's profile:
 *   - Posts tab  : grid of the user's own posts (useInfiniteQuery via feedService.getUserPosts)
 *   - Saved tab  : grid of the user's bookmarked posts (useBookmarks hook)
 *
 * Usage:
 *   <ProfileContentTabs userId={user.id} />
 */

import { useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  TouchableOpacity,
  Image,
  Modal,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Grid2x2, Bookmark, User, Music, Play, ArrowLeft } from 'lucide-react-native';
import { useInfiniteQuery } from '@tanstack/react-query';

import { Text } from '@/components/ui/Text';
import { FeedPostCard } from '@/features/feed/components/FeedPostCard';
import { CommentsSheet } from '@/features/feed/components/comments/CommentsSheet';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { feedService } from '@/features/feed/services/feedService';
import { useBookmarks } from '@/features/feed/hooks/useBookmarks';
import { cloudinaryUrl } from '@/lib/media/cloudinaryUrl';
import type { Post } from '@/types';
import type { FeedPost, PostType } from '@/types/post';
import type { FeedResponse } from '@/features/feed/types';

function toFeedPost(post: Post): FeedPost {
  const type: PostType = (post.contentType as PostType) || 'text';
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
      role: post.author.role,
    },
    audioUrl: type === 'audio' ? (cloudinaryUrl(files[0], 'original', 'raw') ?? undefined) : undefined,
    videoUrl: type === 'video' || type === 'reel' ? (cloudinaryUrl(files[0], 'original', 'video') ?? files[0]) : undefined,
    images: type === 'image' ? files.map((f) => cloudinaryUrl(f, 'feed') ?? f) : undefined,
    title: post.textContent ?? undefined,
    description: post.textContent ?? undefined,
    likesCount: post.likesCount ?? 0,
    commentsCount: post.commentsCount ?? 0,
    sharesCount: post.sharesCount ?? 0,
    repostsCount: post.repostsCount ?? 0,
    isLiked: post.isLiked ?? false,
    isBookmarked: post.isBookmarked ?? false,
    isReposted: post.isReposted ?? false,
    createdAt: post.createdAt,
  };
}

// ─── constants ───────────────────────────────────────────────────────────────

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GAP = 1;
const COLUMNS = 3;
const CELL_SIZE = (SCREEN_WIDTH - GAP * (COLUMNS - 1)) / COLUMNS;

type ActiveTab = 'posts' | 'saved' | 'settings';

// ─── props ────────────────────────────────────────────────────────────────────

interface ProfileContentTabsProps {
  userId: number;
  settingsContent?: React.ReactNode;
}

// ─── sub-components ───────────────────────────────────────────────────────────

/** Single grid cell rendered for every post type. */
function PostThumbnail({ post, onPress }: { post: Post; onPress?: () => void }) {
  const isVideo = post.contentType === 'video';
  const isReel = post.contentType === 'reel';
  const isAudio = post.contentType === 'audio';
  const isText = post.contentType === 'text';
  const rawPath = post.filePaths?.[0] ?? post.images?.[0] ?? null;

  // Resolve the path into a proper CDN URL based on content type
  let firstImage: string | null;
  if (isReel) {
    firstImage = cloudinaryUrl(rawPath, 'reel_thumb', 'video');
  } else if (isVideo) {
    firstImage = cloudinaryUrl(rawPath, 'video_thumb', 'video');
  } else {
    firstImage = cloudinaryUrl(rawPath, 'thumb', 'image') ?? rawPath;
  }

  return (
    <TouchableOpacity
      style={styles.cell}
      activeOpacity={0.8}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Post by ${post.author.displayName}`}
    >
      {firstImage && !isAudio && !isText ? (
        <>
          <Image
            source={{ uri: firstImage }}
            style={styles.cellImage}
            resizeMode="cover"
            accessibilityElementsHidden
          />
          {isVideo && (
            <View style={styles.cellOverlay} pointerEvents="none">
              <Play size={28} color="#FFFFFF" strokeWidth={2.25} />
            </View>
          )}
        </>
      ) : isAudio ? (
        <View style={[styles.cellImage, styles.cellDark]}>
          <Music size={28} color="#3B82F6" strokeWidth={2.25} />
        </View>
      ) : (
        <View style={[styles.cellImage, styles.cellDark, styles.cellTextPad]}>
          <Text
            style={styles.cellTextPreview}
            numberOfLines={4}
            accessibilityElementsHidden
          >
            {post.textContent ?? post.content}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

/** Full-width empty state message. */
function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

/** Renders the active tab's content — plain View grid instead of FlatList
 *  so it doesn't intercept the parent ScrollView's pull-to-refresh gesture. */
function TabContent({
  activeTab,
  settingsContent,
  activeLoading,
  activeData,
  activeFetchingMore,
  emptyMessage,
  onPostPress,
}: {
  activeTab: ActiveTab;
  settingsContent?: React.ReactNode;
  activeLoading: boolean;
  activeData: Post[];
  activeFetchingMore: boolean;
  emptyMessage: string;
  onPostPress?: (post: Post) => void;
}) {
  if (activeTab === 'settings') {
    return <View style={styles.settingsWrap}>{settingsContent}</View>;
  }

  if (activeLoading) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator color="#3B82F6" />
      </View>
    );
  }

  if (activeData.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }

  return (
    <View
      accessibilityLabel={activeTab === 'posts' ? 'User posts grid' : 'Saved posts grid'}
    >
      <View style={styles.grid}>
        {activeData.map((item) => (
          <PostThumbnail
            key={item.id}
            post={item}
            onPress={() => onPostPress?.(item)}
          />
        ))}
      </View>
      {activeFetchingMore && (
        <View style={styles.footerLoader}>
          <ActivityIndicator color="#3B82F6" />
        </View>
      )}
    </View>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export interface ProfileContentTabsHandle {
  handleScrollNearEnd: () => void;
}

export const ProfileContentTabs = forwardRef<ProfileContentTabsHandle, ProfileContentTabsProps>(
  function ProfileContentTabs({ userId, settingsContent }, ref) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('posts');
  const [previewPost, setPreviewPost] = useState<Post | null>(null);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);

  // ── posts query ──────────────────────────────────────────────────────────
  const {
    data: postsData,
    isLoading: postsLoading,
    fetchNextPage: fetchMorePosts,
    hasNextPage: postsHasMore,
    isFetchingNextPage: postsFetchingMore,
  } = useInfiniteQuery<FeedResponse>({
    queryKey: QUERY_KEYS.FEED.USER_POSTS(userId),
    queryFn: ({ pageParam }) =>
      feedService.getUserPosts(userId, pageParam as string | undefined),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
  });

  const posts: Post[] = postsData?.pages.flatMap((p) => p.data) ?? [];

  // ── bookmarks ────────────────────────────────────────────────────────────
  const {
    bookmarks,
    isLoading: savedLoading,
    loadMore: fetchMoreSaved,
    isFetchingMore: savedFetchingMore,
    hasMore: savedHasMore,
  } = useBookmarks();

  // ── handlers ─────────────────────────────────────────────────────────────
  const handleEndReachedPosts = useCallback(() => {
    if (postsHasMore && !postsFetchingMore) {
      fetchMorePosts();
    }
  }, [postsHasMore, postsFetchingMore, fetchMorePosts]);

  const handleEndReachedSaved = useCallback(() => {
    if (savedHasMore && !savedFetchingMore) {
      fetchMoreSaved();
    }
  }, [savedHasMore, savedFetchingMore, fetchMoreSaved]);

  // Expose infinite-scroll trigger to parent ScrollView
  useImperativeHandle(ref, () => ({
    handleScrollNearEnd: () => {
      if (activeTab === 'posts') handleEndReachedPosts();
      else if (activeTab === 'saved') handleEndReachedSaved();
    },
  }), [activeTab, handleEndReachedPosts, handleEndReachedSaved]);

  // ── derived state ─────────────────────────────────────────────────────────
  const activeData = activeTab === 'posts' ? posts : bookmarks;
  const activeLoading = activeTab === 'posts' ? postsLoading : savedLoading;
  const activeFetchingMore =
    activeTab === 'posts' ? postsFetchingMore : savedFetchingMore;
  const emptyMessage = activeTab === 'posts' ? 'No posts yet' : 'No saved posts';

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Tab bar */}
      <View style={styles.tabBar} accessibilityRole="tablist">
        <TouchableOpacity
          style={[styles.tab, activeTab === 'posts' && styles.tabActive]}
          onPress={() => setActiveTab('posts')}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'posts' }}
          accessibilityLabel="Posts"
        >
          <Grid2x2
            size={22}
            color={activeTab === 'posts' ? '#FFFFFF' : '#666666'}
            strokeWidth={2.25}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'saved' && styles.tabActive]}
          onPress={() => setActiveTab('saved')}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'saved' }}
          accessibilityLabel="Saved"
        >
          <Bookmark
            size={22}
            color={activeTab === 'saved' ? '#FFFFFF' : '#666666'}
            strokeWidth={2.25}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'settings' && styles.tabActive]}
          onPress={() => setActiveTab('settings')}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'settings' }}
          accessibilityLabel="Settings"
        >
          <User
            size={22}
            color={activeTab === 'settings' ? '#FFFFFF' : '#666666'}
            strokeWidth={2.25}
          />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <TabContent
        activeTab={activeTab}
        settingsContent={settingsContent}
        activeLoading={activeLoading}
        activeData={activeData}
        activeFetchingMore={activeFetchingMore}
        emptyMessage={emptyMessage}
        onPostPress={setPreviewPost}
      />

      {/* Post preview modal */}
      <Modal
        visible={previewPost !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewPost(null)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={styles.modalBack}
            onPress={() => setPreviewPost(null)}
            hitSlop={16}
          >
            <ArrowLeft size={32} color="#FFF" strokeWidth={2.25} />
          </TouchableOpacity>
          <ScrollView
            contentContainerStyle={styles.modalScroll}
            showsVerticalScrollIndicator={false}
          >
            {previewPost && (
              <FeedPostCard
                post={toFeedPost(previewPost)}
                onComment={() => {
                  console.log('[Profile] onComment tapped, postId:', previewPost.id);
                  setCommentsPostId(previewPost.id);
                }}
              />
            )}
          </ScrollView>

          {commentsPostId && (
            <CommentsSheet
              visible
              onClose={() => setCommentsPostId(null)}
              postId={commentsPostId}
            />
          )}
        </View>
      </Modal>
    </View>
  );
});

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000000',
  },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#222222',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#FFFFFF',
  },

  // Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: GAP,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    marginBottom: GAP,
  },
  cellImage: {
    width: '100%',
    height: '100%',
  },
  cellDark: {
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellTextPad: {
    padding: 8,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  cellTextPreview: {
    fontSize: 11,
    color: '#AAAAAA',
    lineHeight: 16,
  },
  cellOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // States
  emptyState: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyText: {
    color: '#666666',
    fontSize: 14,
  },
  loaderWrap: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  settingsWrap: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 48,
    gap: 24,
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: '#000000',
  },
  modalBack: {
    position: 'absolute',
    top: 56,
    left: 16,
    zIndex: 10,
    padding: 8,
  },
  modalScroll: {
    paddingTop: 100,
    paddingBottom: 40,
  },
});
