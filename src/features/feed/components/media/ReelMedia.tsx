import { useState, useEffect, useCallback } from 'react';
import { View, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Smartphone,
  Ellipsis,
  VolumeX,
  Volume2,
  Play,
  Bookmark,
  Flag,
  Trash2,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { cloudinaryVideoMp4 } from '@/lib/media/cloudinaryUrl';
import { videoPlaybackToggled } from '@/lib/telemetry/videoTelemetry';
import { useAuthStore } from '@/stores/authStore';
import { Avatar } from '@/components/ui/Avatar';
import { CreatorBadge } from '@/components/ui/CreatorBadge';
import { Text } from '@/components/ui/Text';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import { useVideoStream } from '@/hooks/useVideoStream';
import { useVideoProgress } from '@/hooks/useVideoProgress';
import { useCallAwareVideoAudio } from '@/hooks/useCallAwareVideoAudio';
import { VideoPoster } from '@/components/ui/VideoPoster';
import { VideoProgressBar } from '@/components/ui/VideoProgressBar';
import { useVideoSoundStore } from '@/stores/videoSoundStore';
import type { FeedPost, PostAuthor } from '@/types/post';
import { COLORS } from '@/constants/theme';

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
  const { contentWidth } = useDeviceLayout();
  const { t } = useTranslation('feed');
  const currentUserId = useAuthStore((s) => s.user?.id);
  const isOwnPost =
    currentUserId !== undefined && String(post.author.id) === String(currentUserId);
  // Global mute shared across every video (Instagram-style).
  const isMuted = useVideoSoundStore((s) => s.isMuted);
  const toggleMuted = useVideoSoundStore((s) => s.toggleMuted);
  const [menuVisible, setMenuVisible] = useState(false);
  // Tap-to-pause: a manual pause that overrides auto-play-when-visible.
  const [userPaused, setUserPaused] = useState(false);

  // Reels render full-screen: use a fixed 1080p MP4 (not adaptive HLS) so the
  // image is sharp from the first frame. See cloudinaryVideoMp4 for the rationale.
  const videoUrl = cloudinaryVideoMp4(post.videoUrl) ?? null;

  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = true;
    p.muted = useVideoSoundStore.getState().isMuted;
  });

  // During a call, mix instead of stealing the audio session (keeps the call's mic).
  useCallAwareVideoAudio(player);

  // First-frame readiness (drives the poster) + load/error telemetry.
  const isReady = useVideoStream(player, videoUrl, isVisible, {
    surface: 'reel_media',
    postId: post.id,
  });
  const { position, duration } = useVideoProgress(player);

  // Tap the video to pause/resume.
  const togglePlayPause = useCallback(() => {
    if (!player) return;
    const next = !userPaused;
    setUserPaused(next);
    try {
      if (next) player.pause();
      else player.play();
    } catch {
      // player disposed — ignore
    }
    videoPlaybackToggled(
      { surface: 'reel_media', postId: post.id },
      next ? 'pause' : 'play',
      Math.round(position * 1000)
    );
  }, [player, userPaused, post.id, position]);

  // A manual tap-pause wins while visible; scrolling away clears it so the reel
  // auto-plays again when it returns into view.
  useEffect(() => {
    if (!player) return;
    if (isVisible) {
      if (!userPaused) player.play();
    } else {
      player.pause();
      if (userPaused) setUserPaused(false);
    }
  }, [isVisible, userPaused, player]);

  // Sync this player whenever the shared mute state flips so one video's
  // toggle applies to every other mounted video.
  useEffect(() => {
    if (player) player.muted = isMuted;
  }, [isMuted, player]);

  if (!videoUrl) {
    return (
      <View
        style={[styles.placeholder, { width: contentWidth, height: contentWidth * 1.6 }]}
      >
        <Smartphone size={48} color="#666" strokeWidth={1.5} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { width: contentWidth, height: contentWidth * 1.6 }]}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="cover"
        nativeControls={false}
      />

      {/* Poster shown until the stream produces its first frame */}
      <VideoPoster uri={post.thumbnailUrl} visible={!isReady} />

      {/* Thin progress line at the bottom edge */}
      <VideoProgressBar position={position} duration={duration} showTime={false} />

      {/* Tap anywhere on the video to pause/resume. Below the overlays (author /
          menu / mute), which render after and capture their own taps. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={togglePlayPause} />

      {/* Pause indicator while tap-paused. */}
      {userPaused && (
        <View style={styles.pauseOverlay} pointerEvents="none">
          <View style={styles.pauseBadge}>
            <Play size={38} color="#FFF" fill="#FFF" />
          </View>
        </View>
      )}

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
          <Avatar
            uri={post.author.avatar}
            size="md"
            creatorRing={post.author.role === 'creator'}
            fallbackText={post.author.username}
          />
          <Text style={styles.authorName} numberOfLines={1} maxFontSizeMultiplier={1.15}>
            {post.author.username}
          </Text>
          {post.author.role === 'creator' && <CreatorBadge />}
        </TouchableOpacity>

        <View style={styles.spacer} />

        {!isOwnPost && !post.author.isFollowing && (
          <TouchableOpacity
            style={styles.followButton}
            onPress={() => onFollow?.(post.author.id)}
            activeOpacity={0.7}
          >
            <Text style={styles.followText} maxFontSizeMultiplier={1.0}>
              {t('post.followButton')}
            </Text>
          </TouchableOpacity>
        )}

        {!isOwnPost && post.author.isFollowing && (
          <Text
            style={styles.reelFeedLabel}
            numberOfLines={1}
            maxFontSizeMultiplier={1.0}
          >
            {t('post.following')}
          </Text>
        )}

        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => setMenuVisible(true)}
          activeOpacity={0.7}
        >
          <Ellipsis size={22} color="#FFF" strokeWidth={2.25} />
        </TouchableOpacity>
      </LinearGradient>

      {/* Bottom gradient (visual only — description is shown outside the reel) */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.5)']}
        style={styles.bottomGradient}
        pointerEvents="none"
      />

      {/* Mute toggle — bottom-right corner (must render after gradient to be on top) */}
      <TouchableOpacity
        style={styles.muteButton}
        onPress={toggleMuted}
        activeOpacity={0.7}
      >
        {isMuted ? (
          <VolumeX size={20} color="#FFF" strokeWidth={2.25} />
        ) : (
          <Volume2 size={20} color="#FFF" strokeWidth={2.25} />
        )}
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
            <Bookmark
              size={24}
              color="#FFF"
              strokeWidth={2.25}
              fill={post.isBookmarked ? '#FFF' : 'none'}
            />
          </View>
          <Text style={styles.menuText} maxFontSizeMultiplier={1.2}>
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
            <Flag size={24} color="#EF4444" strokeWidth={2.25} />
          </View>
          <Text style={styles.menuTextDanger} maxFontSizeMultiplier={1.2}>
            {t('post.menuReport')}
          </Text>
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
                <Trash2 size={24} color="#EF4444" strokeWidth={2.25} />
              </View>
              <Text style={styles.menuTextDanger} maxFontSizeMultiplier={1.2}>
                Delete post
              </Text>
            </TouchableOpacity>
          </>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.background.primary,
    position: 'relative',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseBadge: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 4,
  },
  placeholder: {
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
    fontSize: 15,
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
