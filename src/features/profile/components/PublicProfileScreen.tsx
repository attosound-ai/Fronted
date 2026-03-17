import { useState } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Modal,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { formatCount } from '@/utils/formatters';
import { useUserProfile } from '../hooks/useUserProfile';
import { PLACEHOLDER_POSTS } from '@/features/feed/constants/placeholderPosts';
import { FeedPostCard } from '@/features/feed/components/FeedPostCard';
import type { FeedPost } from '@/types/post';

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
  const { user, isLoading, error, toggleFollow, isToggling } = useUserProfile(userId);
  const [previewPost, setPreviewPost] = useState<FeedPost | null>(null);

  // Use API data if available, otherwise use fallback from navigation params
  const profile = user ?? null;
  const showFallback = !profile && fallbackAuthor;

  // Get posts for this user (placeholder or API)
  const userPosts = PLACEHOLDER_POSTS.filter((p) => p.author.id === numericId);

  if (isLoading && !fallbackAuthor) {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#FFF" />
        </View>
      </View>
    );
  }

  if (!profile && !showFallback) {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <Text variant="body" style={styles.errorText}>
            {t('publicProfile.errorLoadFailed')}
          </Text>
        </View>
      </View>
    );
  }

  // Merge: full profile from API, or minimal fallback from navigation params
  const displayName = profile?.displayName ?? fallbackAuthor!.displayName;
  const username = profile?.username ?? fallbackAuthor!.username;
  const avatar = profile?.avatar ?? fallbackAuthor?.avatar ?? null;
  const isVerified = profile?.profileVerified ?? fallbackAuthor?.isVerified ?? false;
  const bio = profile?.bio ?? null;
  const role = profile?.role ?? null;
  const postsCount = profile?.postsCount ?? userPosts.length;
  const followersCount = profile?.followersCount ?? 0;
  const followingCount = profile?.followingCount ?? 0;
  const isFollowing = profile?.isFollowing ?? false;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Avatar uri={avatar} size="xl" />

          <Text variant="h2" style={styles.name}>
            {displayName.toUpperCase()}
          </Text>

          <Text variant="caption" style={styles.username}>
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
                {role === 'artist'
                  ? t('publicProfile.roleBadgeArtist')
                  : t('publicProfile.roleBadgeRepresentative')}
              </Text>
              {isVerified && (
                <Ionicons name="checkmark-circle" size={14} color="#3B82F6" />
              )}
            </View>
          )}

          {!role && isVerified && (
            <View style={styles.badge}>
              <Ionicons name="checkmark-circle" size={14} color="#3B82F6" />
              <Text variant="caption" style={styles.badgeText}>
                {t('publicProfile.roleBadgeVerified')}
              </Text>
            </View>
          )}

          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text variant="h2">{formatCount(postsCount)}</Text>
              <Text variant="caption" style={styles.statLabel}>
                {t('publicProfile.statPosts')}
              </Text>
            </View>
            <View style={styles.stat}>
              <Text variant="h2">{formatCount(followersCount)}</Text>
              <Text variant="caption" style={styles.statLabel}>
                {t('publicProfile.statFollowers')}
              </Text>
            </View>
            <View style={styles.stat}>
              <Text variant="h2">{formatCount(followingCount)}</Text>
              <Text variant="caption" style={styles.statLabel}>
                {t('publicProfile.statFollowing')}
              </Text>
            </View>
          </View>

          {profile && (
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
          )}
        </View>

        {/* Posts grid */}
        {userPosts.length > 0 && (
          <>
            <View style={styles.gridDivider} />
            <View style={styles.grid}>
              {userPosts.map((post) => (
                <PostTile
                  key={post.id}
                  post={post}
                  onPress={() => setPreviewPost(post)}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* Post preview modal */}
      <Modal
        visible={previewPost !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewPost(null)}
      >
        <View style={styles.modalBackdrop}>
          {/* Back arrow */}
          <TouchableOpacity
            style={styles.modalBack}
            onPress={() => setPreviewPost(null)}
            hitSlop={16}
          >
            <Ionicons name="arrow-back" size={32} color="#FFF" />
          </TouchableOpacity>

          <ScrollView
            contentContainerStyle={styles.modalScroll}
            showsVerticalScrollIndicator={false}
          >
            {previewPost && <FeedPostCard post={previewPost} />}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function PostTile({ post, onPress }: { post: FeedPost; onPress: () => void }) {
  const thumbnail = getPostThumbnail(post);

  return (
    <TouchableOpacity style={styles.tile} activeOpacity={0.8} onPress={onPress}>
      {thumbnail ? (
        <Image source={{ uri: thumbnail }} style={styles.tileImage} resizeMode="cover" />
      ) : (
        <View style={styles.tilePlaceholder}>
          <Ionicons
            name={post.type === 'audio' ? 'musical-notes' : 'document-text'}
            size={28}
            color="#555"
          />
        </View>
      )}
      {post.type === 'audio' && (
        <View style={styles.tileOverlay}>
          <Ionicons name="musical-notes" size={16} color="#FFF" />
        </View>
      )}
      {post.type === 'video' && (
        <View style={styles.tileOverlay}>
          <Ionicons name="play" size={16} color="#FFF" />
        </View>
      )}
    </TouchableOpacity>
  );
}

function getPostThumbnail(post: FeedPost): string | null {
  if (post.type === 'image' && post.images && post.images.length > 0) {
    return post.images[0];
  }
  if (post.type === 'audio' && post.author.avatar) {
    return post.author.avatar;
  }
  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
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
    marginTop: 8,
    gap: 40,
  },
  stat: {
    alignItems: 'center',
  },
  statLabel: {
    color: '#888',
  },
  followButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: 12,
  },
  followingButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#333',
  },
  followButtonText: {
    color: '#FFF',
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
  tileOverlay: {
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
});
