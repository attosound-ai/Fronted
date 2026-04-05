import { useState, useEffect, useRef } from 'react';
import {
  View,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Animated,
  Image,
  Modal,
  Pressable,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ChevronLeft, ArrowLeft, Music, FileText, Play, X, MessageCircle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { Logo } from '@/components/ui/Logo';
import { CreatorBadge } from '@/components/ui/CreatorBadge';
import { formatCount } from '@/utils/formatters';
import { cloudinaryUrl } from '@/lib/media/cloudinaryUrl';
import { useUserProfile } from '../hooks/useUserProfile';
import { feedService } from '@/features/feed/services/feedService';
import { FeedPostCard } from '@/features/feed/components/FeedPostCard';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { FeedPost, PostType } from '@/types/post';
import type { Post } from '@/types';
import type { FeedResponse } from '@/features/feed/types';

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
        ? (cloudinaryUrl(files[0], 'original', 'video') ?? files[0])
        : undefined,
    thumbnailUrl: post.metadata?.thumbnailUrl
      ?? (type === 'reel' ? cloudinaryUrl(files[0], 'reel_thumb', 'video') : undefined)
      ?? (type === 'video' ? cloudinaryUrl(files[0], 'video_thumb', 'video') : undefined),
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = 2;
const GRID_COLUMNS = 3;
const TILE_SIZE = (SCREEN_WIDTH - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

interface FallbackAuthor {
  displayName: string;
  username: string;
  avatar: string | null;
  isVerified: boolean;
}

interface PublicProfileScreenProps {
  userId: string;
  fallbackAuthor?: FallbackAuthor;
}

export function PublicProfileScreen({
  userId,
  fallbackAuthor,
}: PublicProfileScreenProps) {
  const { t } = useTranslation('profile');
  const numericId = Number(userId);
  const { user, isLoading, isFetching, isPartial, error, refetch, toggleFollow, isToggling } =
    useUserProfile(userId);
  const [previewPost, setPreviewPost] = useState<FeedPost | null>(null);
  const [avatarModalVisible, setAvatarModalVisible] = useState(false);

  // Use API data if available, otherwise use fallback from navigation params
  const profile = user ?? null;
  const showFallback = !profile && fallbackAuthor;

  // Fetch user's posts
  const { data: postsData, isLoading: postsLoading } = useInfiniteQuery<FeedResponse>({
    queryKey: QUERY_KEYS.FEED.USER_POSTS(numericId),
    queryFn: ({ pageParam }) =>
      feedService.getUserPosts(numericId, pageParam as string | undefined),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    enabled: numericId > 0,
  });

  const userPosts: FeedPost[] = (postsData?.pages.flatMap((p) => p.data) ?? []).map(
    (p) => toFeedPost(p as Post)
  );

  const navigateToList = (mode: 'followers' | 'following') => {
    router.push({
      pathname: '/following',
      params: { userId, mode },
    });
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ChevronLeft size={28} color="#FFFFFF" strokeWidth={2.25} />
          </TouchableOpacity>
        </View>
        <ProfileSkeleton />
      </SafeAreaView>
    );
  }

  if (!profile && !showFallback) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ChevronLeft size={28} color="#FFFFFF" strokeWidth={2.25} />
          </TouchableOpacity>
        </View>
        <View style={styles.centered}>
          <Text variant="body" style={styles.errorText}>
            {t('publicProfile.errorLoadFailed')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Merge: full profile from API, or minimal fallback from navigation params
  const displayName =
    (profile?.displayName || profile?.creatorName || profile?.username) ??
    fallbackAuthor!.displayName;
  const username = profile?.username ?? fallbackAuthor!.username;
  const avatar = profile?.avatar ?? fallbackAuthor?.avatar ?? null;
  const isVerified = profile?.profileVerified ?? fallbackAuthor?.isVerified ?? false;
  const bio = profile?.bio ?? null;
  const role = profile?.role ?? null;
  const countsLoaded = profile?.followersCount !== undefined;
  const postsCount = profile?.postsCount ?? userPosts.length;
  const followersCount = profile?.followersCount ?? 0;
  const followingCount = profile?.followingCount ?? 0;
  const isFollowing = profile?.isFollowing ?? false;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ChevronLeft size={28} color="#FFFFFF" strokeWidth={2.25} />
        </TouchableOpacity>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={refetch}
            tintColor="#FFFFFF"
          />
        }
      >
        <View style={styles.hero}>
          <TouchableOpacity
            onPress={() => setAvatarModalVisible(true)}
            activeOpacity={0.7}
          >
            <Avatar uri={avatar} size="xl" />
          </TouchableOpacity>

          <Text variant="h2" style={styles.name}>
            @{username}
          </Text>

          {bio && (
            <Text variant="body" style={styles.bio}>
              {bio}
            </Text>
          )}

          {role && role !== 'listener' && (
            <View style={styles.badge}>
              <Text variant="caption" style={styles.badgeText}>
                {role === 'creator'
                  ? t('publicProfile.roleBadgeCreator')
                  : t('publicProfile.roleBadgeRepresentative')}
              </Text>
              {role === 'creator' && <CreatorBadge />}
            </View>
          )}

          <View style={styles.stats}>
            <View style={styles.stat}>
              {!countsLoaded ? (
                <SkeletonBox style={styles.statSkeleton} />
              ) : (
                <Text variant="h2">{formatCount(postsCount)}</Text>
              )}
              <Text variant="caption" style={styles.statLabel}>
                {t('publicProfile.statPosts')}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.stat}
              activeOpacity={0.7}
              onPress={() => navigateToList('followers')}
              disabled={!countsLoaded}
            >
              {!countsLoaded ? (
                <SkeletonBox style={styles.statSkeleton} />
              ) : (
                <Text variant="h2">{formatCount(followersCount)}</Text>
              )}
              <Text variant="caption" style={styles.statLabel}>
                {t('publicProfile.statFollowers')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.stat}
              activeOpacity={0.7}
              onPress={() => navigateToList('following')}
              disabled={!countsLoaded}
            >
              {!countsLoaded ? (
                <SkeletonBox style={styles.statSkeleton} />
              ) : (
                <Text variant="h2">{formatCount(followingCount)}</Text>
              )}
              <Text variant="caption" style={styles.statLabel}>
                {t('publicProfile.statFollowing')}
              </Text>
            </TouchableOpacity>
          </View>

          {profile && (
            <View style={styles.actionRow}>
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: '/chat',
                    params: {
                      participantId: userId,
                      participantName: displayName,
                    },
                  })
                }
                activeOpacity={0.7}
                style={styles.chatButton}
              >
                <MessageCircle size={18} color="#FFF" strokeWidth={2.25} />
                <Text variant="body" style={styles.chatButtonText}>
                  {t('publicProfile.messageButton', { defaultValue: 'Message' })}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={toggleFollow}
                disabled={isToggling}
                activeOpacity={0.7}
                style={[styles.followButton, isFollowing && styles.followingButton]}
              >
                <Text
                  variant="body"
                  style={[
                    styles.followButtonText,
                    isFollowing && styles.followingButtonText,
                  ]}
                >
                  {isFollowing
                    ? t('publicProfile.followingButton')
                    : t('publicProfile.followButton')}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Posts grid */}
        <View style={styles.gridDivider} />
        {postsLoading || isPartial ? (
          <View style={styles.grid}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <SkeletonBox key={i} style={styles.tileSkeleton} />
            ))}
          </View>
        ) : userPosts.length > 0 ? (
          <View style={styles.grid}>
            {userPosts.map((post) => (
              <PostTile
                key={post.id}
                post={post}
                onPress={() => setPreviewPost(post)}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyPosts}>
            <Text style={styles.emptyPostsText}>
              {t('publicProfile.noPosts', { defaultValue: 'No posts yet' })}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Avatar fullscreen modal */}
      <Modal
        visible={avatarModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAvatarModalVisible(false)}
      >
        <Pressable
          style={styles.avatarModal}
          onPress={() => setAvatarModalVisible(false)}
        >
          <TouchableOpacity
            style={styles.avatarModalClose}
            onPress={() => setAvatarModalVisible(false)}
            hitSlop={16}
          >
            <X size={28} color="#FFF" strokeWidth={2.25} />
          </TouchableOpacity>
          {avatar ? (
            <Image
              source={{ uri: cloudinaryUrl(avatar, 'avatar_lg') ?? avatar }}
              style={styles.avatarModalImage}
              resizeMode="contain"
            />
          ) : (
            <Logo size={200} />
          )}
        </Pressable>
      </Modal>

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
            {previewPost && <FeedPostCard post={previewPost} />}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function PostTile({ post, onPress }: { post: FeedPost; onPress: () => void }) {
  const thumbnail = getPostThumbnail(post);
  const previewText = post.title || post.description;

  return (
    <TouchableOpacity style={styles.tile} activeOpacity={0.8} onPress={onPress}>
      {thumbnail ? (
        <Image source={{ uri: thumbnail }} style={styles.tileImage} resizeMode="cover" />
      ) : (
        <View style={styles.tilePlaceholder}>
          {previewText ? (
            <Text style={styles.tilePreviewText} numberOfLines={4}>
              {previewText}
            </Text>
          ) : post.type === 'audio' ? (
            <Music size={28} color="#555" strokeWidth={2.25} />
          ) : (
            <FileText size={28} color="#555" strokeWidth={2.25} />
          )}
        </View>
      )}
      {/* Title overlay on image/video tiles */}
      {thumbnail && previewText && (
        <View style={styles.tileTextOverlay}>
          <Text style={styles.tileOverlayText} numberOfLines={2}>
            {previewText}
          </Text>
        </View>
      )}
      {post.type === 'audio' && (
        <View style={styles.tileTypeIcon}>
          <Music size={14} color="#FFF" strokeWidth={2.25} />
        </View>
      )}
      {post.type === 'video' && (
        <View style={styles.tileTypeIcon}>
          <Play size={14} color="#FFF" strokeWidth={2.25} />
        </View>
      )}
    </TouchableOpacity>
  );
}

function getPostThumbnail(post: FeedPost): string | null {
  if (post.thumbnailUrl) return post.thumbnailUrl;
  if (post.type === 'image' && post.images && post.images.length > 0) {
    return post.images[0];
  }
  return null;
}

/* ── Skeleton ── */
function SkeletonBox({ style }: { style: object }) {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);
  return <Animated.View style={[{ backgroundColor: '#1A1A1A' }, style, { opacity }]} />;
}

function ProfileSkeleton() {
  return (
    <View style={skeletonStyles.container}>
      <SkeletonBox style={skeletonStyles.avatar} />
      <SkeletonBox style={skeletonStyles.name} />
      <SkeletonBox style={skeletonStyles.username} />
      <View style={skeletonStyles.statsRow}>
        <SkeletonBox style={skeletonStyles.stat} />
        <SkeletonBox style={skeletonStyles.stat} />
        <SkeletonBox style={skeletonStyles.stat} />
      </View>
      <View style={skeletonStyles.buttonsRow}>
        <SkeletonBox style={skeletonStyles.button} />
        <SkeletonBox style={skeletonStyles.button} />
      </View>
      <View style={skeletonStyles.gridRow}>
        <SkeletonBox style={skeletonStyles.gridTile} />
        <SkeletonBox style={skeletonStyles.gridTile} />
        <SkeletonBox style={skeletonStyles.gridTile} />
      </View>
      <View style={skeletonStyles.gridRow}>
        <SkeletonBox style={skeletonStyles.gridTile} />
        <SkeletonBox style={skeletonStyles.gridTile} />
        <SkeletonBox style={skeletonStyles.gridTile} />
      </View>
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  container: { alignItems: 'center', paddingTop: 32, gap: 12 },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  name: { width: 160, height: 20, borderRadius: 4 },
  username: { width: 100, height: 14, borderRadius: 4 },
  statsRow: { flexDirection: 'row', gap: 32, marginTop: 8 },
  stat: { width: 50, height: 36, borderRadius: 4 },
  buttonsRow: { flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginHorizontal: 24, marginTop: 4 },
  button: { flex: 1, height: 42, borderRadius: 8 },
  gridRow: { flexDirection: 'row', gap: GRID_GAP, marginTop: GRID_GAP },
  gridTile: { width: TILE_SIZE, height: TILE_SIZE, borderRadius: 0 },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#888',
  },
  content: {
    paddingTop: 16,
  },
  hero: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
  },
  name: {
    marginTop: 8,
  },
  username: {
    color: '#888',
  },
  bio: {
    color: '#888',
    textAlign: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  badgeText: {
    color: '#AAA',
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
    marginTop: 8,
    gap: 40,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    color: '#888',
  },
  statSkeleton: {
    width: 30,
    height: 20,
    borderRadius: 4,
    marginBottom: 2,
  },
  tileSkeleton: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: 0,
  },
  actionRow: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    gap: 10,
    marginTop: 12,
  },
  chatButton: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatButtonText: {
    color: '#FFF',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 14,
  },
  followButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  followingButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#333',
  },
  followButtonText: {
    color: '#000000',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 14,
  },
  followingButtonText: {
    color: '#FFF',
  },
  gridDivider: {
    height: 1,
    backgroundColor: '#222',
    marginTop: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    position: 'relative',
  },
  tileImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#111',
  },
  tilePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tilePreviewText: {
    color: '#999',
    fontSize: 11,
    lineHeight: 15,
    paddingHorizontal: 8,
    textAlign: 'center',
  },
  tileTextOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  tileOverlayText: {
    color: '#DDD',
    fontSize: 10,
    lineHeight: 13,
  },
  tileTypeIcon: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: '#000',
  },
  modalBack: {
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
  },
  modalScroll: {
    flexGrow: 1,
  },
  emptyPosts: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyPostsText: {
    color: '#666',
    fontSize: 14,
  },
  avatarModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarModalClose: {
    position: 'absolute',
    top: 56,
    right: 20,
    zIndex: 10,
  },
  avatarModalImage: {
    width: 280,
    height: 280,
    borderRadius: 140,
  },
});
