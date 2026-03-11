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

import { useState, useCallback } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  Image,
  Dimensions,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery } from '@tanstack/react-query';

import { Text } from '@/components/ui/Text';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { feedService } from '@/features/feed/services/feedService';
import { useBookmarks } from '@/features/feed/hooks/useBookmarks';
import { cloudinaryUrl } from '@/lib/media/cloudinaryUrl';
import type { Post } from '@/types';
import type { FeedResponse } from '@/features/feed/types';

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
function PostThumbnail({ post }: { post: Post }) {
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
              <Ionicons name="play-circle" size={28} color="#FFFFFF" />
            </View>
          )}
        </>
      ) : isAudio ? (
        <View style={[styles.cellImage, styles.cellDark]}>
          <Ionicons name="musical-notes" size={28} color="#3B82F6" />
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

/** Renders the active tab's content — extracted to reduce cognitive complexity. */
function TabContent({
  activeTab,
  settingsContent,
  activeLoading,
  activeData,
  activeFetchingMore,
  activeEndReached,
  emptyMessage,
}: {
  activeTab: ActiveTab;
  settingsContent?: React.ReactNode;
  activeLoading: boolean;
  activeData: Post[];
  activeFetchingMore: boolean;
  activeEndReached: () => void;
  emptyMessage: string;
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

  return (
    <FlatList
      key={activeTab}
      data={activeData}
      keyExtractor={(item) => item.id}
      numColumns={COLUMNS}
      renderItem={({ item }) => <PostThumbnail post={item} />}
      ListEmptyComponent={<EmptyState message={emptyMessage} />}
      ListFooterComponent={
        activeFetchingMore ? (
          <View style={styles.footerLoader}>
            <ActivityIndicator color="#3B82F6" />
          </View>
        ) : null
      }
      onEndReached={activeEndReached}
      onEndReachedThreshold={0.4}
      columnWrapperStyle={styles.row}
      scrollEnabled={false}
      showsVerticalScrollIndicator={false}
      accessibilityLabel={activeTab === 'posts' ? 'User posts grid' : 'Saved posts grid'}
    />
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function ProfileContentTabs({ userId, settingsContent }: ProfileContentTabsProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('posts');

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

  // ── derived state ─────────────────────────────────────────────────────────
  const activeData = activeTab === 'posts' ? posts : bookmarks;
  const activeLoading = activeTab === 'posts' ? postsLoading : savedLoading;
  const activeFetchingMore =
    activeTab === 'posts' ? postsFetchingMore : savedFetchingMore;
  const activeEndReached =
    activeTab === 'posts' ? handleEndReachedPosts : handleEndReachedSaved;
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
          <Ionicons
            name="grid-outline"
            size={22}
            color={activeTab === 'posts' ? '#FFFFFF' : '#666666'}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'saved' && styles.tabActive]}
          onPress={() => setActiveTab('saved')}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'saved' }}
          accessibilityLabel="Saved"
        >
          <Ionicons
            name="bookmark-outline"
            size={22}
            color={activeTab === 'saved' ? '#FFFFFF' : '#666666'}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'settings' && styles.tabActive]}
          onPress={() => setActiveTab('settings')}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'settings' }}
          accessibilityLabel="Settings"
        >
          <Ionicons
            name="person-outline"
            size={22}
            color={activeTab === 'settings' ? '#FFFFFF' : '#666666'}
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
        activeEndReached={activeEndReached}
        emptyMessage={emptyMessage}
      />
    </View>
  );
}

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
  row: {
    gap: GAP,
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
});
