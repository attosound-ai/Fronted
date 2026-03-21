import { useState, useCallback, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { cloudinaryUrl } from '@/lib/media/cloudinaryUrl';
import { useAuthStore } from '@/stores/authStore';
import { Avatar } from '@/components/ui/Avatar';
import { Text } from '@/components/ui/Text';
import { BottomSheet } from '@/components/ui/BottomSheet';
import type { FeedPost, PostAuthor } from '@/types/post';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ReelMediaProps {
  post: FeedPost;
  isVisible?: boolean;
  onProfilePress?: (author: PostAuthor) => void;
  onFollow?: (userId: number) => void;
  onBookmark?: () => void;
  onReport?: () => void;
  onDelete?: () => void;
}

export function ReelMedia({
  post,
  isVisible = false,
  onProfilePress,
  onFollow,
  onBookmark,
  onReport,
  onDelete,
}: ReelMediaProps) {
  const { t } = useTranslation('feed');
  const currentUserId = useAuthStore((s) => s.user?.id);
  const isOwnPost =
    currentUserId !== undefined && String(post.author.id) === String(currentUserId);
  const [isMuted, setIsMuted] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);

  const videoUrl = post.videoUrl
    ? (cloudinaryUrl(post.videoUrl, 'original', 'video') ?? post.videoUrl)
    : null;

  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = true;
    p.muted = true;
  });

  useEffect(() => {
    if (!player) return;
    if (isVisible) {
      player.play();
    } else {
      player.pause();
    }
  }, [isVisible, player]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      player.muted = !prev;
      return !prev;
    });
  }, [player]);

  if (!videoUrl) {
    return (
      <View style={styles.placeholder}>
        <Ionicons name="phone-portrait-outline" size={48} color="#666" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="cover"
        nativeControls={false}
      />

      {/* Top gradient — author info + follow + menu */}
      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'transparent']}
        style={styles.topGradient}
      >
        <TouchableOpacity
          style={styles.authorRow}
          onPress={() => onProfilePress?.(post.author)}
          activeOpacity={0.7}
        >
          <Avatar uri={post.author.avatar} size="sm" />
          <Text style={styles.authorName}>{post.author.displayName.toUpperCase()}</Text>
          {post.author.isVerified && (
            <Ionicons name="checkmark-circle" size={14} color="#FFF" />
          )}
        </TouchableOpacity>

        <View style={styles.spacer} />

        {!isOwnPost && !post.author.isFollowing && (
          <TouchableOpacity
            style={styles.followButton}
            onPress={() => onFollow?.(post.author.id)}
            activeOpacity={0.7}
          >
            <Text style={styles.followText}>{t('post.followButton')}</Text>
          </TouchableOpacity>
        )}

        {!isOwnPost && (
          <Text style={styles.reelFeedLabel}>
            {post.author.isFollowing ? t('post.following') : t('post.suggestedForYou')}
          </Text>
        )}

        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => setMenuVisible(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color="#FFF" />
        </TouchableOpacity>
      </LinearGradient>

      {/* Bottom gradient with description */}
      {post.description ? (
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.5)']}
          style={styles.bottomGradient}
          pointerEvents="none"
        >
          <Text style={styles.description} numberOfLines={2} selectable={false}>
            {post.description}
          </Text>
        </LinearGradient>
      ) : null}

      {/* Mute toggle — bottom-right corner (must render after gradient to be on top) */}
      <TouchableOpacity
        style={styles.muteButton}
        onPress={toggleMute}
        activeOpacity={0.7}
      >
        <Ionicons name={isMuted ? 'volume-mute' : 'volume-high'} size={18} color="#FFF" />
      </TouchableOpacity>

      {/* Options bottom sheet */}
      <BottomSheet visible={menuVisible} onClose={() => setMenuVisible(false)}>
        <TouchableOpacity
          style={styles.menuItem}
          activeOpacity={0.7}
          onPress={() => {
            setMenuVisible(false);
            onBookmark?.();
          }}
        >
          <View style={styles.menuIcon}>
            <Ionicons
              name={post.isBookmarked ? 'bookmark' : 'bookmark-outline'}
              size={24}
              color="#FFF"
            />
          </View>
          <Text style={styles.menuText}>
            {post.isBookmarked ? t('post.menuUnsave') : t('post.menuSave')}
          </Text>
        </TouchableOpacity>

        <View style={styles.menuDivider} />

        <TouchableOpacity
          style={styles.menuItem}
          activeOpacity={0.7}
          onPress={() => {
            setMenuVisible(false);
            onReport?.();
          }}
        >
          <View style={styles.menuIcon}>
            <Ionicons name="flag-outline" size={24} color="#EF4444" />
          </View>
          <Text style={styles.menuTextDanger}>{t('post.menuReport')}</Text>
        </TouchableOpacity>

        {isOwnPost && (
          <>
            <View style={styles.menuDivider} />
            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => {
                setMenuVisible(false);
                onDelete?.();
              }}
            >
              <View style={styles.menuIcon}>
                <Ionicons name="trash-outline" size={24} color="#EF4444" />
              </View>
              <Text style={styles.menuTextDanger}>Delete post</Text>
            </TouchableOpacity>
          </>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 1.6,
    backgroundColor: '#000',
    position: 'relative',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 1.6,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Top overlay
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 28,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  authorName: {
    color: '#FFF',
    fontSize: 13,
    fontFamily: 'Archivo_600SemiBold',
  },
  reelFeedLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    marginHorizontal: 24,
  },
  spacer: {
    flex: 1,
  },
  followButton: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginRight: 10,
  },
  followText: {
    color: '#FFF',
    fontSize: 12,
    fontFamily: 'Archivo_600SemiBold',
  },
  menuButton: {
    padding: 4,
  },

  // Mute
  muteButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 20,
    padding: 6,
  },

  // Bottom overlay
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 44,
    paddingHorizontal: 12,
    paddingTop: 24,
  },
  description: {
    color: '#FFF',
    fontSize: 13,
    fontFamily: 'Archivo_400Regular',
  },

  // Options menu
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 14,
  },
  menuIcon: {
    width: 32,
    alignItems: 'center',
  },
  menuText: {
    color: '#FFF',
    fontSize: 16,
    fontFamily: 'Archivo_400Regular',
  },
  menuTextDanger: {
    color: '#EF4444',
    fontSize: 16,
    fontFamily: 'Archivo_400Regular',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#222',
    marginHorizontal: 16,
  },
});
