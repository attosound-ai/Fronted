/**
 * ReelsFeed — Full-screen vertical-swipe reels feed (TikTok/Reels style).
 *
 * Single Responsibility: Renders only the reels feed experience.
 * Open/Closed: Reel item UI is encapsulated in ReelItem — easy to extend without
 *   touching the list logic.
 * Dependency Inversion: Consumes useReelsFeed / useInteractions abstractions.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewToken,
} from 'react-native';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Bookmark,
  Film,
  Heart,
  Megaphone,
  MessageCircle,
  Send,
  Volume2,
  VolumeX,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { cloudinaryUrl } from '@/lib/media/cloudinaryUrl';
import { useAuthStore } from '@/stores/authStore';
import { useReelsFeed } from '../hooks/useReelsFeed';
import { useInteractions } from '../hooks/useInteractions';
import { useFollowFeed } from '../hooks/useFollowFeed';
import { useFollowStore } from '@/stores/followStore';
import { LinkedText } from './LinkedText';
import { CreatorBadge } from '@/components/ui/CreatorBadge';
import { feedService } from '../services/feedService';
import { DEMO_ADS } from '../constants/adPosts';
import { injectAds } from '../utils/injectAds';
import { CommentsSheet } from './comments/CommentsSheet';
import { ShareSheet } from './share/ShareSheet';
import { formatCount } from '@/utils/formatters';
import { ReelsSkeleton } from '@/components/ui/Skeleton';
import type { FeedPost, PostAuthor, PostType } from '@/types/post'; // PostType used in toFeedPost helper
import type { Post } from '@/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const TAB_BAR_HEIGHT = 49;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const REEL_HEIGHT = SCREEN_HEIGHT - TAB_BAR_HEIGHT;

// ─── Post conversion helpers (mirrored from FeedList.tsx) ─────────────────────

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
        ? (cloudinaryUrl(files[0], 'original', 'raw') ?? files[0])
        : undefined,
    videoUrl:
      type === 'video' || type === 'reel'
        ? (cloudinaryUrl(files[0], 'original', 'video') ?? files[0])
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
    isFollowingAuthor: post.isFollowingAuthor,
  };
}

// ─── ReelItem ─────────────────────────────────────────────────────────────────

interface ReelItemProps {
  post: FeedPost;
  isActive: boolean;
  currentUserId?: number | string;
  onLike: (id: string) => void;
  onBookmark: (id: string) => void;
  onComment: (id: string) => void;
  onShare: (post: FeedPost) => void;
  onFollow: (userId: number) => void;
}

/**
 * ReelItem — a single full-screen reel cell.
 *
 * Video playback is driven by `isActive`: the player only plays when
 * the reel is the currently visible one, pausing automatically when
 * scrolled away. This prevents audio overlap and conserves resources.
 */
function ReelItem({
  post,
  isActive,
  currentUserId,
  onLike,
  onBookmark,
  onComment,
  onShare,
  onFollow,
}: ReelItemProps) {
  const { t } = useTranslation('feed');
  const isOwnPost =
    currentUserId !== undefined && String(post.author.id) === String(currentUserId);
  const [isMuted, setIsMuted] = useState(true);
  const [captionExpanded, setCaptionExpanded] = useState(false);

  const videoUrl = post.videoUrl
    ? (cloudinaryUrl(post.videoUrl, 'original', 'video') ?? post.videoUrl)
    : null;

  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = true;
    p.muted = true;
  });

  // Play / pause driven by visibility — must run as an effect, never during render
  useEffect(() => {
    if (!player) return;
    if (isActive) {
      player.play();
    } else {
      player.pause();
    }
  }, [isActive, player]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      player.muted = !prev;
      return !prev;
    });
  }, [player]);

  const avatarUri = post.author.avatar
    ? (cloudinaryUrl(post.author.avatar, 'avatar_sm') ?? undefined)
    : undefined;

  return (
    <View style={styles.reelContainer}>
      {/* ── Video layer ── */}
      {videoUrl ? (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls={false}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.noVideoPlaceholder]}>
          <Film size={56} color="#555" strokeWidth={2.25} />
        </View>
      )}

      {/* ── Gradient scrim at the bottom so text is readable ── */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.85)']}
        style={styles.bottomScrim}
        pointerEvents="none"
      />

      {/* ── Mute / unmute ── */}
      <TouchableOpacity style={styles.muteButton} onPress={toggleMute} hitSlop={12}>
        {isMuted ? (
          <VolumeX size={20} color="#FFF" strokeWidth={2.25} />
        ) : (
          <Volume2 size={20} color="#FFF" strokeWidth={2.25} />
        )}
      </TouchableOpacity>

      {/* ── Right-side action column ── */}
      <View style={styles.actionsColumn}>
        {/* Like */}
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => onLike(post.id)}
          activeOpacity={0.75}
        >
          <Heart
            size={30}
            color={post.isLiked ? '#EF4444' : '#FFF'}
            fill={post.isLiked ? '#EF4444' : 'none'}
            strokeWidth={2.25}
          />
          <Text style={styles.actionCount}>{formatCount(post.likesCount)}</Text>
        </TouchableOpacity>

        {/* Comment */}
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => onComment(post.id)}
          activeOpacity={0.75}
        >
          <MessageCircle size={28} color="#FFF" strokeWidth={2.25} />
          <Text style={styles.actionCount}>{formatCount(post.commentsCount)}</Text>
        </TouchableOpacity>

        {/* Share */}
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => onShare(post)}
          activeOpacity={0.75}
        >
          <Send size={28} color="#FFF" strokeWidth={2.25} />
          <Text style={styles.actionCount}>{formatCount(post.sharesCount)}</Text>
        </TouchableOpacity>

        {/* Bookmark */}
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => onBookmark(post.id)}
          activeOpacity={0.75}
        >
          <Bookmark
            size={28}
            color={post.isBookmarked ? '#FACC15' : '#FFF'}
            fill={post.isBookmarked ? '#FACC15' : 'none'}
            strokeWidth={2.25}
          />
        </TouchableOpacity>
      </View>

      {/* ── Bottom author + description overlay ── */}
      <View style={styles.bottomOverlay}>
        {/* Author row */}
        <View style={styles.authorRow}>
          <TouchableOpacity
            style={styles.authorTouchable}
            activeOpacity={0.7}
            onPress={() => {
              if (isOwnPost) {
                router.navigate('/(tabs)/profile');
              } else {
                router.navigate({
                  pathname: '/user/[id]',
                  params: {
                    id: String(post.author.id),
                    displayName: post.author.displayName,
                    username: post.author.username,
                    avatar: post.author.avatar ?? '',
                  },
                });
              }
            }}
          >
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>
                  {post.author.displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={styles.username} numberOfLines={1}>
              {post.author.username}
            </Text>
            {post.author.role === 'creator' && <CreatorBadge style={styles.verified} />}
          </TouchableOpacity>
          {!isOwnPost && !post.author.isFollowing && (
            <TouchableOpacity
              onPress={() => onFollow(post.author.id)}
              activeOpacity={0.7}
              style={styles.followButton}
            >
              <Text style={styles.followText}>+ Follow</Text>
            </TouchableOpacity>
          )}
          {!isOwnPost && (
            <Text style={styles.reelFeedLabel}>
              {post.author.isFollowing ? t('post.following') : t('post.suggestedForYou')}
            </Text>
          )}
        </View>

        {/* Description */}
        {!!post.description && (
          <TouchableOpacity
            onPress={() => setCaptionExpanded((v) => !v)}
            activeOpacity={0.9}
          >
            <LinkedText
              style={styles.description}
              numberOfLines={captionExpanded ? undefined : 2}
            >
              {post.description}
            </LinkedText>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── AdReelItem ───────────────────────────────────────────────────────────────

interface AdReelItemProps {
  post: FeedPost;
  isActive: boolean;
}

/**
 * AdReelItem — Full-screen ad in the reels feed.
 * Same layout as ReelItem but without social actions or author row.
 */
function AdReelItem({ post, isActive }: AdReelItemProps) {
  const [isMuted, setIsMuted] = useState(true);

  const player = useVideoPlayer(post.videoUrl ?? null, (p) => {
    p.loop = true;
    p.muted = true;
  });

  useEffect(() => {
    if (!player) return;
    if (isActive) {
      player.play();
    } else {
      player.pause();
    }
  }, [isActive, player]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      player.muted = !prev;
      return !prev;
    });
  }, [player]);

  return (
    <View style={styles.reelContainer}>
      {post.videoUrl ? (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls={false}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.noVideoPlaceholder]}>
          <Film size={56} color="#555" strokeWidth={2.25} />
        </View>
      )}

      {/* Gradient scrim */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.6)']}
        style={styles.bottomScrim}
        pointerEvents="none"
      />

      {/* Sponsored badge — top-right */}
      <View style={styles.adSponsoredBadge}>
        <Megaphone size={12} color="#CCC" strokeWidth={2.25} />
        <Text style={styles.adSponsoredText}>Sponsored</Text>
      </View>

      {/* Mute toggle */}
      <TouchableOpacity style={styles.muteButton} onPress={toggleMute} hitSlop={12}>
        {isMuted ? (
          <VolumeX size={20} color="#FFF" strokeWidth={2.25} />
        ) : (
          <Volume2 size={20} color="#FFF" strokeWidth={2.25} />
        )}
      </TouchableOpacity>
    </View>
  );
}

// ─── ReelsFeed ────────────────────────────────────────────────────────────────

/**
 * ReelsFeed — the full-screen vertical paging list.
 * Only shows posts with type 'reel' (not 'video').
 */
export function ReelsFeed() {
  const { posts, isLoading, isFetchingMore, hasMore, loadMore } = useReelsFeed();
  const { toggleLike, toggleBookmark, trackShare } = useInteractions();
  const { toggleFollow, getIsFollowing } = useFollowFeed();
  const followedUsers = useFollowStore((s) => s.followedUsers);
  const hydrateFromApi = useFollowStore((s) => s.hydrateFromApi);
  const currentUserId = useAuthStore((s) => s.user?.id);

  // Hydrate follow store from API data on reels load
  useEffect(() => {
    if (posts.length === 0) return;
    const entries = posts
      .filter((p) => p.isFollowingAuthor !== undefined)
      .map((p) => ({ userId: Number(p.author.id), isFollowing: p.isFollowingAuthor! }));
    if (entries.length > 0) hydrateFromApi(entries);
  }, [posts, hydrateFromApi]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const [sharePost, setSharePost] = useState<FeedPost | null>(null);
  // Track when current reel started playing (for watch-time reporting)
  const reelStartRef = useRef<number>(Date.now());
  const activePostIdRef = useRef<string | null>(null);

  const realPosts = posts
    .map(toFeedPost)
    .filter((p) => p.type === 'reel')
    .map((p) => ({
      ...p,
      author: {
        ...p.author,
        isFollowing: getIsFollowing(p.author.id, p.author.isFollowing),
      },
    }));
  const displayPosts: FeedPost[] = injectAds(realPosts, DEMO_ADS);

  // Viewability config — a reel is "active" when >= 80% is visible
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 80,
  });

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        const newIndex = viewableItems[0].index;
        const newPostId = viewableItems[0].item?.id ?? null;

        // Record watch time for the reel we just scrolled away from
        if (activePostIdRef.current && activePostIdRef.current !== newPostId) {
          const watchMs = Date.now() - reelStartRef.current;
          feedService.recordReelView(activePostIdRef.current, watchMs, 0).catch(() => {});
        }

        setActiveIndex(newIndex);
        activePostIdRef.current = newPostId;
        reelStartRef.current = Date.now();
      }
    }
  );

  const handleEndReached = useCallback(() => {
    if (hasMore && !isFetchingMore) {
      loadMore();
    }
  }, [hasMore, isFetchingMore, loadMore]);

  const handleFollow = useCallback(
    (userId: number) => {
      toggleFollow(userId, getIsFollowing(userId, false));
    },
    [toggleFollow, getIsFollowing]
  );

  const renderItem = useCallback(
    ({ item, index }: { item: FeedPost; index: number }) => {
      if (item.isAd) {
        return <AdReelItem post={item} isActive={index === activeIndex} />;
      }
      return (
        <ReelItem
          post={item}
          isActive={index === activeIndex}
          currentUserId={currentUserId}
          onLike={toggleLike}
          onBookmark={toggleBookmark}
          onFollow={handleFollow}
          onComment={setCommentsPostId}
          onShare={setSharePost}
        />
      );
    },
    [activeIndex, currentUserId, toggleLike, toggleBookmark, handleFollow]
  );

  const renderFooter = useCallback(() => {
    if (!isFetchingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator color="#FFF" />
      </View>
    );
  }, [isFetchingMore]);

  if (isLoading && displayPosts.length === 0) {
    return <ReelsSkeleton />;
  }

  if (displayPosts.length === 0) {
    return (
      <View style={styles.centered}>
        <Film size={56} color="#555" strokeWidth={2.25} />
        <Text style={styles.emptyText}>No reels yet</Text>
        <Text style={styles.emptySubtext}>Check back soon</Text>
      </View>
    );
  }

  return (
    <>
      <View style={styles.root}>
        <FlatList
          data={displayPosts}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          pagingEnabled
          snapToInterval={REEL_HEIGHT}
          snapToAlignment="start"
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
          viewabilityConfig={viewabilityConfig.current}
          onViewableItemsChanged={onViewableItemsChanged.current}
          // Remove momentum bounce so snapping feels crisp
          bounces={false}
          overScrollMode="never"
          // Prevent unnecessary re-renders of off-screen items
          removeClippedSubviews
          windowSize={3}
          maxToRenderPerBatch={2}
          initialNumToRender={1}
          getItemLayout={(_, index) => ({
            length: REEL_HEIGHT,
            offset: REEL_HEIGHT * index,
            index,
          })}
        />
      </View>

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
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },

  // ── Reel item ──
  reelContainer: {
    width: SCREEN_WIDTH,
    height: REEL_HEIGHT,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  noVideoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111',
  },

  // Scrim: a tall gradient-ish overlay so bottom text is legible over any video
  bottomScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: REEL_HEIGHT * 0.35,
  },

  muteButton: {
    position: 'absolute',
    top: 56,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Right actions column ──
  actionsColumn: {
    position: 'absolute',
    right: 12,
    bottom: 120,
    alignItems: 'center',
    gap: 20,
  },
  actionButton: {
    alignItems: 'center',
    gap: 4,
  },
  actionCount: {
    color: '#FFF',
    fontSize: 12,
    fontFamily: 'Archivo_500Medium',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  // ── Bottom author / description ──
  bottomOverlay: {
    position: 'absolute',
    left: 12,
    right: 72,
    bottom: 56,
    gap: 8,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  authorTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#FFF',
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#333',
    borderWidth: 1.5,
    borderColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#FFF',
    fontSize: 14,
    fontFamily: 'Archivo_600SemiBold',
  },
  username: {
    color: '#FFF',
    fontSize: 15,
    fontFamily: 'Archivo_600SemiBold',
    flexShrink: 1,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  verified: {
    marginLeft: 2,
  },
  followButton: {
    marginLeft: 8,
    borderWidth: 1,
    borderColor: '#FFF',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  followText: {
    color: '#FFF',
    fontSize: 12,
    fontFamily: 'Archivo_600SemiBold',
  },
  reelFeedLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    marginLeft: 8,
  },
  description: {
    color: '#FFF',
    fontSize: 13,
    fontFamily: 'Archivo_400Regular',
    lineHeight: 19,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  // ── Ad reel badge ──
  adSponsoredBadge: {
    position: 'absolute',
    top: 56,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  adSponsoredText: {
    color: '#CCC',
    fontSize: 12,
    fontFamily: 'Archivo_500Medium',
    letterSpacing: 0.3,
  },

  // ── Loading / empty states ──
  centered: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    color: '#FFF',
    fontSize: 18,
    fontFamily: 'Archivo_600SemiBold',
    marginTop: 8,
  },
  emptySubtext: {
    color: '#AAA',
    fontSize: 14,
    fontFamily: 'Archivo_400Regular',
  },
  footerLoader: {
    height: REEL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
});
