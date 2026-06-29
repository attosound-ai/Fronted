import { useState, useEffect } from 'react';
import { View, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { VideoOff, VolumeX, Volume2 } from 'lucide-react-native';
import { cloudinaryHlsUrl } from '@/lib/media/cloudinaryUrl';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import { useVideoStream } from '@/hooks/useVideoStream';
import { useVideoProgress } from '@/hooks/useVideoProgress';
import { useCallAwareVideoAudio } from '@/hooks/useCallAwareVideoAudio';
import { VideoPoster } from '@/components/ui/VideoPoster';
import { VideoProgressBar } from '@/components/ui/VideoProgressBar';
import { useVideoSoundStore } from '@/stores/videoSoundStore';
import { useDoubleTapLike } from '@/features/feed/hooks/useDoubleTapLike';
import type { FeedPost, PostAuthor } from '@/types/post';
import { COLORS } from '@/constants/theme';
import { VideoOverlayHeader } from './VideoOverlayHeader';
import { HeartBurst } from './HeartBurst';
/**
 * Height-to-width ratio from the video's native dimensions.
 *
 * The width is always fixed to the feed's content width; the height follows the
 * video's true aspect ratio so uploads render exactly as the creator shot them
 * (no clamping, no cropping). Guards against zero/garbage dimensions.
 */
function heightRatioFor(w: number, h: number): number {
  if (!w || w <= 0 || !h || h <= 0) return 1;
  return h / w;
}

interface VideoMediaProps {
  post: FeedPost;
  isVisible?: boolean;
  /** Single tap → expand the video full-screen (reel viewer). When omitted, a
   *  single tap does nothing (e.g. inside the post-detail / reel viewer itself). */
  onPress?: () => void;
  /** Double tap → like (Instagram-style), with a heart burst. */
  onDoubleTap?: () => void;
  /** Draw the author row (avatar · name · follow · ⋯) INSIDE the video at the
   *  top edge — used for vertical ~9:16 clips in the home feed so they read like
   *  reels. The separate PostHeader is suppressed for those. */
  overlayHeader?: boolean;
  onProfilePress?: (author: PostAuthor) => void;
  onFollow?: (userId: number) => void;
  onBookmark?: () => void;
  onReport?: () => void;
  onDelete?: () => void;
}

export function VideoMedia({
  post,
  isVisible = false,
  onPress,
  onDoubleTap,
  overlayHeader = false,
  onProfilePress,
  onFollow,
  onBookmark,
  onReport,
  onDelete,
}: VideoMediaProps) {
  const { contentWidth } = useDeviceLayout();
  // Pause when the screen loses focus (e.g. tapping the video opens the reel
  // viewer over the feed) so the feed video's audio never keeps playing behind it.
  const isFocused = useIsFocused();
  // Global mute shared across every video (Instagram-style): toggling here
  // mutes/unmutes all videos at once.
  const isMuted = useVideoSoundStore((s) => s.isMuted);
  const toggleMuted = useVideoSoundStore((s) => s.toggleMuted);
  // Single tap expands to the reel viewer; double tap likes (with a heart burst).
  const { handleTap, heartScale, heartOpacity } = useDoubleTapLike({
    onSingleTap: onPress,
    onDoubleTap,
  });
  const [heightRatio, setHeightRatio] = useState(() => {
    if (post.mediaWidth && post.mediaHeight && post.mediaWidth > 0) {
      return heightRatioFor(post.mediaWidth, post.mediaHeight);
    }
    return 1; // default 1:1 while loading
  });

  const containerHeight = contentWidth * heightRatio;

  const videoUrl = cloudinaryHlsUrl(post.videoUrl) ?? null;

  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = true;
    // Start at the current shared mute state so a freshly-mounted video matches
    // whatever the rest of the feed is doing (the effect below keeps it synced).
    p.muted = useVideoSoundStore.getState().isMuted;
  });

  // During a call, mix instead of stealing the audio session (keeps the call's mic).
  useCallAwareVideoAudio(player);

  // First-frame readiness (drives the poster) + transparent HLS→MP4 fallback
  // + load/error telemetry tagged to the feed surface.
  const isReady = useVideoStream(player, videoUrl, isVisible && isFocused, {
    surface: 'feed',
    postId: post.id,
  });

  // Playback position + duration for the time readout and progress bar.
  const { position, duration } = useVideoProgress(player);

  // Detect aspect ratio from the player's decoded video track (most reliable).
  useEffect(() => {
    if (post.mediaWidth && post.mediaHeight) return;
    if (!player) return;

    const readSize = () => {
      const track = player.videoTrack;
      if (track && track.size.width > 0) {
        setHeightRatio(heightRatioFor(track.size.width, track.size.height));
      }
    };

    // Already loaded — read immediately
    if (player.status === 'readyToPlay') {
      readSize();
      return;
    }

    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') readSize();
    });
    return () => sub.remove();
  }, [player, post.mediaWidth, post.mediaHeight]);

  useEffect(() => {
    if (!player) return;
    if (isVisible && isFocused) {
      player.play();
    } else {
      player.pause();
    }
  }, [isVisible, isFocused, player]);

  // Keep this player's audio in sync whenever the shared mute state flips —
  // this is what makes one video's toggle apply to every other mounted video.
  useEffect(() => {
    if (player) player.muted = isMuted;
  }, [isMuted, player]);

  if (!videoUrl) {
    return (
      <View
        style={[styles.placeholder, { width: contentWidth, height: containerHeight }]}
      >
        <VideoOff size={48} color="#666" strokeWidth={2.25} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { width: contentWidth, height: containerHeight }]}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="contain"
        nativeControls={false}
      />
      <VideoPoster uri={post.thumbnailUrl} visible={!isReady} resizeMode="contain" />
      {/* Single tap expands to the reel viewer; double tap likes. Sits above the
          video but below the mute button / overlay header (rendered after), which
          keep their own taps. */}
      {(onPress || onDoubleTap) && (
        <Pressable style={StyleSheet.absoluteFill} onPress={handleTap} />
      )}
      <VideoProgressBar position={position} duration={duration} />
      <TouchableOpacity style={styles.muteButton} onPress={toggleMuted} hitSlop={8}>
        {isMuted ? (
          <VolumeX size={18} color="#FFF" strokeWidth={2.25} />
        ) : (
          <Volume2 size={18} color="#FFF" strokeWidth={2.25} />
        )}
      </TouchableOpacity>
      {/* Author row overlaid at the top edge for vertical (~9:16) clips. Rendered
          last so its avatar / follow / menu touchables win over the tap-to-open
          layer below them. */}
      {overlayHeader && (
        <VideoOverlayHeader
          post={post}
          onProfilePress={onProfilePress}
          onFollow={onFollow}
          onBookmark={onBookmark}
          onReport={onReport}
          onDelete={onDelete}
        />
      )}
      {/* Double-tap like heart burst */}
      <HeartBurst scale={heartScale} opacity={heartOpacity} />
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
  placeholder: {
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  muteButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 16,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
