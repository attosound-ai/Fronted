/**
 * ReelsFeed — Full-screen vertical-swipe reels feed (TikTok/Reels style).
 *
 * Single Responsibility: Renders only the reels feed experience.
 * Open/Closed: Reel item UI is encapsulated in ReelItem — easy to extend without
 *   touching the list logic.
 * Dependency Inversion: Consumes useReelsFeed / useInteractions abstractions.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallAwareVideoAudio } from '@/hooks/useCallAwareVideoAudio';
import {
  Bookmark,
  ChevronLeft,
  Film,
  Megaphone,
  MessageCircle,
  Play,
  Send,
  Volume2,
  VolumeX,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import {
  cloudinaryUrl,
  cloudinaryHlsUrl,
  cloudinaryVideoMp4,
  cloudinaryPoster,
} from '@/lib/media/cloudinaryUrl';
import { useVideoStream } from '@/hooks/useVideoStream';
import { useVideoProgress } from '@/hooks/useVideoProgress';
import { videoPlaybackToggled } from '@/lib/telemetry/videoTelemetry';
import { VideoPoster } from '@/components/ui/VideoPoster';
import { VideoProgressBar } from '@/components/ui/VideoProgressBar';
import { Avatar } from '@/components/ui/Avatar';
import { GlassSurface } from '@/components/navigation/GlassSurface';
import { ThumbsUpIcon } from '@/components/ui/ThumbsUpIcon';
import { useAuthStore } from '@/stores/authStore';
import { useReelsFeed } from '../hooks/useReelsFeed';
import { useInteractions } from '../hooks/useInteractions';
import { useFollowFeed } from '../hooks/useFollowFeed';
import { useFollowStore } from '@/stores/followStore';
import { useVideoSoundStore } from '@/stores/videoSoundStore';
import { LinkedText } from './LinkedText';
import { CreatorBadge } from '@/components/ui/CreatorBadge';
import { feedService } from '../services/feedService';
import { DEMO_ADS } from '../constants/adPosts';
import { injectAds } from '../utils/injectAds';
import { isReelEligible, isLandscapeVideo } from '../utils/reelFormat';
import { useDoubleTapLike } from '../hooks/useDoubleTapLike';
import { HeartBurst } from './media/HeartBurst';
import { CommentsSheet } from './comments/CommentsSheet';
import { ShareSheet } from './share/ShareSheet';
import { formatCount } from '@/utils/formatters';
import { ReelsSkeleton } from '@/components/ui/Skeleton';
import type { FeedPost, PostType } from '@/types/post'; // PostType used in toFeedPost helper
import type { Post } from '@/types';
import { COLORS } from '@/constants/theme';

// ─── Constants ────────────────────────────────────────────────────────────────

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
// Full-bleed: the floating Liquid Glass navbar overlays reels (TikTok/IG style),
// so each reel fills the whole screen rather than reserving tab-bar height.
const REEL_HEIGHT = SCREEN_HEIGHT;

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
        ? (cloudinaryHlsUrl(files[0]) ?? files[0])
        : undefined,
    thumbnailUrl:
      type === 'video' || type === 'reel'
        ? (cloudinaryPoster(files[0], type === 'reel' ? 'reel' : 'video') ??
          post.metadata?.thumbnailUrl)
        : post.metadata?.thumbnailUrl,
    duration: post.metadata?.duration ? Number(post.metadata.duration) : undefined,
    mediaWidth: post.metadata?.width ? Number(post.metadata.width) : undefined,
    mediaHeight: post.metadata?.height ? Number(post.metadata.height) : undefined,
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
  /** 'cover' (FYP, 9:16 reels) or 'contain' (seeded viewer — landscape videos
   *  get letterbox bars instead of being cropped). Defaults to 'cover'. */
  contentFit?: 'cover' | 'contain';
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
  contentFit = 'cover',
}: ReelItemProps) {
  const { t } = useTranslation('feed');
  const isOwnPost =
    currentUserId !== undefined && String(post.author.id) === String(currentUserId);
  // Global mute shared across every video (Instagram-style).
  const isMuted = useVideoSoundStore((s) => s.isMuted);
  const toggleMuted = useVideoSoundStore((s) => s.toggleMuted);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  // Tap-to-pause: a manual pause that overrides the auto-play-when-active logic.
  const [userPaused, setUserPaused] = useState(false);
  // Pause when the screen loses focus (e.g. opening a profile or the reel viewer
  // over the feed) so audio never lingers behind another screen.
  const isFocused = useIsFocused();
  // Live "should this reel be playing" flag for the deferred single-tap handler,
  // so a tap that lands just before scrolling away never resumes an off-screen reel.
  const activeRef = useRef(false);
  activeRef.current = isActive && isFocused;

  // Full-screen reels use a fixed 1080p MP4 (not adaptive HLS) for sharpness.
  const videoUrl = cloudinaryVideoMp4(post.videoUrl) ?? null;

  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = true;
    p.muted = useVideoSoundStore.getState().isMuted;
    // ALWAYS mixWithOthers at CREATION. expo-video's default ('auto') seizes the
    // AVAudioSession Playback category — output-only, NO microphone. On a VoIP-push
    // cold launch these reels mount before JS knows a call is incoming, so the
    // session was stolen from the call: telemetry on the dropped call showed
    // category=Playback / inPort=none → call_connect_failure (David, Jul 27).
    // Setting it reactively afterwards (useCallAwareVideoAudio) is too late for that
    // window. Sound still plays for the user; it just mixes instead of seizing.
    p.audioMixingMode = 'mixWithOthers';
  });

  // During a call, mix instead of stealing the audio session (keeps the call's mic).
  useCallAwareVideoAudio(player);

  // Tracks first-frame readiness + transparently falls back HLS→MP4 on error,
  // and reports load-time / error telemetry tagged to this reel.
  const isReady = useVideoStream(player, videoUrl, isActive && isFocused, {
    surface: 'reels',
    postId: post.id,
  });
  const { position, duration } = useVideoProgress(player);

  // Tap the video to pause/resume. Overrides auto-play while the reel stays the
  // active one; auto-play resumes on the next reel.
  const togglePlayPause = useCallback(() => {
    if (!player) return;
    const next = !userPaused;
    setUserPaused(next);
    try {
      if (next) player.pause();
      // Only resume if this reel is still the active, focused one (the single-tap
      // action is deferred, so it can fire after a quick scroll-away).
      else if (activeRef.current) player.play();
    } catch {
      // player disposed (cell recycled) — ignore
    }
    videoPlaybackToggled(
      { surface: 'reels', postId: post.id },
      next ? 'pause' : 'play',
      Math.round(position * 1000)
    );
  }, [player, userPaused, post.id, position]);

  // Play / pause driven by visibility AND screen focus — must run as an effect,
  // never during render. A manual tap-pause (userPaused) wins while the reel is
  // active; scrolling away (or the screen losing focus) clears it so returning
  // to the reel auto-plays again.
  useEffect(() => {
    if (!player) return;
    if (isActive && isFocused) {
      if (!userPaused) player.play();
    } else {
      player.pause();
      if (userPaused) setUserPaused(false);
    }
  }, [isActive, isFocused, userPaused, player]);

  // Double-tap → like (never unlike, Instagram-style).
  const handleDoubleTapLike = useCallback(() => {
    if (!post.isLiked) onLike(post.id);
  }, [post.isLiked, post.id, onLike]);

  // Single tap = pause/resume, double tap = like + heart burst.
  const { handleTap, heartScale, heartOpacity } = useDoubleTapLike({
    onSingleTap: togglePlayPause,
    onDoubleTap: handleDoubleTapLike,
  });

  // Sync this player whenever the shared mute state flips.
  useEffect(() => {
    if (player) player.muted = isMuted;
  }, [isMuted, player]);

  return (
    <View style={styles.reelContainer}>
      {/* ── Video layer ── */}
      {videoUrl ? (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit={contentFit}
          nativeControls={false}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.noVideoPlaceholder]}>
          <Film size={56} color="#555" strokeWidth={2.25} />
        </View>
      )}

      {/* Poster shown until the stream produces its first frame. Matches the
          video's contentFit so a landscape clip isn't briefly shown cropped to
          9:16 before the (contain) video settles in. */}
      <VideoPoster uri={post.thumbnailUrl} visible={!isReady} resizeMode={contentFit} />

      {/* Thin progress line at the bottom edge */}
      <VideoProgressBar position={position} duration={duration} showTime={false} />

      {/* ── Gradient scrim at the bottom so text is readable ── */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.85)']}
        style={styles.bottomScrim}
        pointerEvents="none"
      />

      {/* Single tap = pause/resume, double tap = like. Rendered above the video
          but below the action column + bottom overlay, which come after and
          capture their own taps. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={handleTap} />

      {/* Pause indicator while the user has tapped to pause. */}
      {userPaused && (
        <View style={styles.pauseOverlay} pointerEvents="none">
          <View style={styles.pauseBadge}>
            <Play size={42} color="#FFF" fill="#FFF" />
          </View>
        </View>
      )}

      {/* Double-tap like heart burst */}
      <HeartBurst scale={heartScale} opacity={heartOpacity} />

      {/* ── Mute / unmute ── */}
      {/* ── Right-side action column ── */}
      <View style={styles.actionsColumn}>
        {/* Like — thumbs up (the app's like icon) */}
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => onLike(post.id)}
          activeOpacity={0.75}
        >
          <ThumbsUpIcon size={30} color="#FFF" filled={post.isLiked} />
          <Text style={styles.actionCount} maxFontSizeMultiplier={1.0}>
            {formatCount(post.likesCount)}
          </Text>
        </TouchableOpacity>

        {/* Comment */}
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => onComment(post.id)}
          activeOpacity={0.75}
        >
          <MessageCircle size={28} color="#FFF" strokeWidth={2.25} />
          <Text style={styles.actionCount} maxFontSizeMultiplier={1.0}>
            {formatCount(post.commentsCount)}
          </Text>
        </TouchableOpacity>

        {/* Share */}
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => onShare(post)}
          activeOpacity={0.75}
        >
          <Send size={28} color="#FFF" strokeWidth={2.25} />
          <Text style={styles.actionCount} maxFontSizeMultiplier={1.0}>
            {formatCount(post.sharesCount)}
          </Text>
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

        {/* Mute — sits below the save button */}
        <TouchableOpacity
          style={styles.actionButton}
          onPress={toggleMuted}
          activeOpacity={0.75}
          hitSlop={8}
        >
          {isMuted ? (
            <VolumeX size={28} color="#FFF" strokeWidth={2.25} />
          ) : (
            <Volume2 size={28} color="#FFF" strokeWidth={2.25} />
          )}
        </TouchableOpacity>
      </View>

      {/* ── Bottom author + description overlay ── */}
      <View style={styles.bottomOverlay}>
        {/* Context label — sits ABOVE the author row so it never competes
            for horizontal space with username + Follow button. Inline
            placement broke at fontScale > 1.0. */}
        {!isOwnPost && (
          <Text
            style={styles.reelFeedLabel}
            numberOfLines={1}
            maxFontSizeMultiplier={1.0}
          >
            {post.author.isFollowing ? t('post.following') : t('post.suggestedForYou')}
          </Text>
        )}
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
                    username: post.author.username,
                    avatar: post.author.avatar ?? '',
                  },
                });
              }
            }}
          >
            <Avatar
              uri={post.author.avatar}
              size="md"
              creatorRing={post.author.role === 'creator'}
              fallbackText={post.author.username}
              style={post.author.role === 'creator' ? undefined : styles.avatarBorder}
            />
            <Text style={styles.username} numberOfLines={1} maxFontSizeMultiplier={1.15}>
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
              <Text style={styles.followText} maxFontSizeMultiplier={1.0}>
                {t('reels.followButton')}
              </Text>
            </TouchableOpacity>
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
              maxFontSizeMultiplier={1.2}
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
  const { t } = useTranslation('feed');
  // Global mute shared across every video (Instagram-style).
  const isMuted = useVideoSoundStore((s) => s.isMuted);
  const toggleMuted = useVideoSoundStore((s) => s.toggleMuted);
  // Pause when the screen loses focus so ad audio never lingers behind another screen.
  const isFocused = useIsFocused();

  // Full-screen reels use a fixed 1080p MP4 (not adaptive HLS) for sharpness.
  const videoUrl = cloudinaryVideoMp4(post.videoUrl) ?? null;

  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = true;
    p.muted = useVideoSoundStore.getState().isMuted;
    // ALWAYS mixWithOthers at CREATION. expo-video's default ('auto') seizes the
    // AVAudioSession Playback category — output-only, NO microphone. On a VoIP-push
    // cold launch these reels mount before JS knows a call is incoming, so the
    // session was stolen from the call: telemetry on the dropped call showed
    // category=Playback / inPort=none → call_connect_failure (David, Jul 27).
    // Setting it reactively afterwards (useCallAwareVideoAudio) is too late for that
    // window. Sound still plays for the user; it just mixes instead of seizing.
    p.audioMixingMode = 'mixWithOthers';
  });

  // During a call, mix instead of stealing the audio session (keeps the call's mic).
  useCallAwareVideoAudio(player);

  const isReady = useVideoStream(player, videoUrl, isActive && isFocused, {
    surface: 'reels_ad',
    postId: post.id,
  });

  useEffect(() => {
    if (!player) return;
    if (isActive && isFocused) {
      player.play();
    } else {
      player.pause();
    }
  }, [isActive, isFocused, player]);

  // Sync this player whenever the shared mute state flips.
  useEffect(() => {
    if (player) player.muted = isMuted;
  }, [isMuted, player]);

  return (
    <View style={styles.reelContainer}>
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

      {/* Poster shown until the stream produces its first frame */}
      <VideoPoster uri={post.thumbnailUrl} visible={!isReady} />

      {/* Gradient scrim */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.6)']}
        style={styles.bottomScrim}
        pointerEvents="none"
      />

      {/* Sponsored badge — top-right */}
      <View style={styles.adSponsoredBadge}>
        <Megaphone size={12} color="#CCC" strokeWidth={2.25} />
        <Text style={styles.adSponsoredText} maxFontSizeMultiplier={1.0}>
          {t('reels.sponsored')}
        </Text>
      </View>

      {/* Mute toggle */}
      <TouchableOpacity style={styles.muteButton} onPress={toggleMuted} hitSlop={12}>
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
 * Shows reels plus vertical (~9:16) videos.
 */
interface ReelsFeedProps {
  /** Seed the pager with a specific list (e.g. tapped from the home feed)
   *  instead of the reels FYP. When set, the reels endpoint is NOT fetched. */
  seedPosts?: Post[];
  /** Start the pager on this post id (within the seeded list). */
  initialPostId?: string;
  /** Shows a back button and is called when it's pressed (pushed-screen mode). */
  onClose?: () => void;
  /** Load more from the seeded source when nearing the end. */
  onEndReached?: () => void;
  /** Footer spinner while the seeded source loads more. */
  isFetchingMore?: boolean;
}

export function ReelsFeed({
  seedPosts,
  initialPostId,
  onClose,
  onEndReached: onSeededEndReached,
  isFetchingMore: seededFetchingMore,
}: ReelsFeedProps = {}) {
  const { t } = useTranslation('feed');
  const seeded = seedPosts !== undefined;
  const insets = useSafeAreaInsets();
  // The reels FYP query is disabled in seeded mode (we already have the list).
  const {
    posts: fypPosts,
    isLoading,
    isRefreshing,
    isFetchingMore: fypFetchingMore,
    hasMore,
    loadMore,
    refresh,
  } = useReelsFeed(!seeded);
  const { toggleLike, toggleBookmark, trackShare } = useInteractions();
  const { toggleFollow, getIsFollowing } = useFollowFeed();
  // Subscribed (even though unread) so a follow-state change re-renders the list.
  const followedUsers = useFollowStore((s) => s.followedUsers);
  const hydrateFromApi = useFollowStore((s) => s.hydrateFromApi);
  const currentUserId = useAuthStore((s) => s.user?.id);

  const sourcePosts = seeded ? seedPosts : fypPosts;
  const isFetchingMore = seeded ? !!seededFetchingMore : fypFetchingMore;

  // Hydrate follow store from API data
  useEffect(() => {
    if (sourcePosts.length === 0) return;
    const entries = sourcePosts
      .filter((p) => p.isFollowingAuthor !== undefined)
      .map((p) => ({ userId: Number(p.author.id), isFollowing: p.isFollowingAuthor! }));
    if (entries.length > 0) hydrateFromApi(entries);
  }, [sourcePosts, hydrateFromApi]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const [sharePost, setSharePost] = useState<FeedPost | null>(null);
  // Track when current reel started playing (for watch-time reporting)
  const reelStartRef = useRef<number>(Date.now());
  const activePostIdRef = useRef<string | null>(null);

  // Seeded mode shows ALL videos (so any tapped feed video opens, even
  // landscape); the FYP keeps its reel-eligibility filter + injected ads.
  const realPosts = sourcePosts
    .map(toFeedPost)
    .filter(seeded ? (p) => p.type === 'video' || p.type === 'reel' : isReelEligible)
    .map((p) => ({
      ...p,
      author: {
        ...p.author,
        isFollowing: getIsFollowing(p.author.id, p.author.isFollowing),
      },
    }));
  const displayPosts: FeedPost[] = seeded ? realPosts : injectAds(realPosts, DEMO_ADS);

  // Where the pager should open when seeded (the tapped video's position).
  const initialIndex = useMemo(() => {
    if (!initialPostId) return 0;
    const i = displayPosts.findIndex((p) => p.id === initialPostId);
    return i < 0 ? 0 : i;
  }, [displayPosts, initialPostId]);

  // Jump the active index to the tapped video once the seeded list is known.
  useEffect(() => {
    if (seeded) setActiveIndex(initialIndex);
  }, [seeded, initialIndex]);

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
    if (seeded) {
      onSeededEndReached?.();
      return;
    }
    if (hasMore && !isFetchingMore) {
      loadMore();
    }
  }, [seeded, onSeededEndReached, hasMore, isFetchingMore, loadMore]);

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
          // Portrait/square clips fill the screen edge-to-edge (cover), just like
          // the reels section — no letterbox bars. Only genuinely landscape
          // videos use contain (in the seeded viewer) so they aren't cropped;
          // there the bars are the lesser evil.
          contentFit={
            seeded && isLandscapeVideo(item.mediaWidth, item.mediaHeight)
              ? 'contain'
              : 'cover'
          }
        />
      );
    },
    [activeIndex, currentUserId, toggleLike, toggleBookmark, handleFollow, seeded]
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
      <ScrollView
        contentContainerStyle={styles.centered}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor="#FFF"
          />
        }
      >
        <Film size={56} color="#555" strokeWidth={2.25} />
        <Text style={styles.emptyText} maxFontSizeMultiplier={1.2}>
          {t('reels.emptyTitle')}
        </Text>
        <Text style={styles.emptySubtext} maxFontSizeMultiplier={1.2}>
          {t('reels.emptySubtitle')}
        </Text>
      </ScrollView>
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
          // Open on the tapped video when seeded (getItemLayout makes this exact).
          initialScrollIndex={seeded ? initialIndex : undefined}
          refreshControl={
            seeded ? undefined : (
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={refresh}
                tintColor="#FFF"
              />
            )
          }
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

        {/* Back button — only in pushed-screen (seeded) mode. Liquid-glass
            capsule so it matches the app's chrome (navbar / in-call bar). */}
        {onClose && (
          <GlassSurface
            radius={20}
            style={[styles.viewerBackButton, { top: insets.top + 8 }]}
          >
            <TouchableOpacity
              onPress={onClose}
              style={styles.viewerBackInner}
              hitSlop={16}
            >
              <ChevronLeft size={26} color="#FFFFFF" strokeWidth={2.25} />
            </TouchableOpacity>
          </GlassSurface>
        )}
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
    backgroundColor: COLORS.background.primary,
  },
  viewerBackButton: {
    position: 'absolute',
    left: 12,
    zIndex: 20,
    width: 40,
    height: 40,
  },
  viewerBackInner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Reel item ──
  reelContainer: {
    width: SCREEN_WIDTH,
    height: REEL_HEIGHT,
    backgroundColor: COLORS.background.primary,
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

  // Centered play badge shown while tap-paused.
  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseBadge: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 4, // optical centering of the play triangle
  },

  // ── Right actions column ──
  actionsColumn: {
    position: 'absolute',
    right: 12,
    bottom: 150,
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
  // Ad reels have no actions column — their mute toggle sits bottom-right,
  // matching the position of the regular reel's mute button.
  muteButton: {
    position: 'absolute',
    right: 12,
    bottom: 150,
  },

  // ── Bottom author / description ──
  // Raised so the floating navbar never covers the caption/author.
  bottomOverlay: {
    position: 'absolute',
    left: 12,
    right: 72,
    bottom: 110,
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
  // White ring for non-creator avatars (creators get the gold ring instead).
  avatarBorder: {
    borderWidth: 1.5,
    borderColor: '#FFF',
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
    fontFamily: 'Archivo_500Medium',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
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
    backgroundColor: COLORS.background.primary,
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
    backgroundColor: COLORS.background.primary,
  },
});
