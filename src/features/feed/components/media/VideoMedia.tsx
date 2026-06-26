import { useState, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { VideoOff, VolumeX, Volume2 } from 'lucide-react-native';
import { cloudinaryHlsUrl } from '@/lib/media/cloudinaryUrl';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import { useVideoStream } from '@/hooks/useVideoStream';
import { useVideoProgress } from '@/hooks/useVideoProgress';
import { VideoPoster } from '@/components/ui/VideoPoster';
import { VideoProgressBar } from '@/components/ui/VideoProgressBar';
import { useVideoSoundStore } from '@/stores/videoSoundStore';
import type { FeedPost } from '@/types/post';
import { COLORS } from '@/constants/theme';
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
}

export function VideoMedia({ post, isVisible = false }: VideoMediaProps) {
  const { contentWidth } = useDeviceLayout();
  // Global mute shared across every video (Instagram-style): toggling here
  // mutes/unmutes all videos at once.
  const isMuted = useVideoSoundStore((s) => s.isMuted);
  const toggleMuted = useVideoSoundStore((s) => s.toggleMuted);
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

  // First-frame readiness (drives the poster) + transparent HLS→MP4 fallback.
  const isReady = useVideoStream(player, videoUrl, isVisible);

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
    if (isVisible) {
      player.play();
    } else {
      player.pause();
    }
  }, [isVisible, player]);

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
      <VideoPoster uri={post.thumbnailUrl} visible={!isReady} />
      <VideoProgressBar position={position} duration={duration} />
      <TouchableOpacity style={styles.muteButton} onPress={toggleMuted} hitSlop={8}>
        {isMuted ? (
          <VolumeX size={18} color="#FFF" strokeWidth={2.25} />
        ) : (
          <Volume2 size={18} color="#FFF" strokeWidth={2.25} />
        )}
      </TouchableOpacity>
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
