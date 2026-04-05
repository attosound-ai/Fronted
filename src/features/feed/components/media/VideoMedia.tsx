import { useState, useCallback, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { VideoOff, VolumeX, Volume2 } from 'lucide-react-native';
import { cloudinaryUrl } from '@/lib/media/cloudinaryUrl';
import type { FeedPost } from '@/types/post';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MIN_HEIGHT_RATIO = 0.5625; // 16:9 landscape
const MAX_HEIGHT_RATIO = 1.25; // 4:5 portrait

function clampRatio(w: number, h: number): number {
  return Math.min(MAX_HEIGHT_RATIO, Math.max(MIN_HEIGHT_RATIO, h / w));
}

interface VideoMediaProps {
  post: FeedPost;
  isVisible?: boolean;
}

export function VideoMedia({ post, isVisible = false }: VideoMediaProps) {
  const [isMuted, setIsMuted] = useState(true);
  const [heightRatio, setHeightRatio] = useState(() => {
    if (post.mediaWidth && post.mediaHeight && post.mediaWidth > 0) {
      return clampRatio(post.mediaWidth, post.mediaHeight);
    }
    return 1; // default 1:1 while loading
  });

  const containerHeight = SCREEN_WIDTH * heightRatio;

  const videoUrl = post.videoUrl
    ? (cloudinaryUrl(post.videoUrl, 'original', 'video') ?? post.videoUrl)
    : null;

  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = true;
    p.muted = true;
  });

  // Detect aspect ratio from the player's decoded video track (most reliable).
  useEffect(() => {
    if (post.mediaWidth && post.mediaHeight) return;
    if (!player) return;

    const readSize = () => {
      const track = player.videoTrack;
      if (track && track.size.width > 0) {
        setHeightRatio(clampRatio(track.size.width, track.size.height));
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

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      player.muted = !prev;
      return !prev;
    });
  }, [player]);

  if (!videoUrl) {
    return (
      <View style={[styles.placeholder, { height: containerHeight }]}>
        <VideoOff size={48} color="#666" strokeWidth={2.25} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { height: containerHeight }]}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="cover"
        nativeControls={false}
      />
      <TouchableOpacity style={styles.muteButton} onPress={toggleMute} hitSlop={8}>
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
    width: SCREEN_WIDTH,
    backgroundColor: '#000',
    position: 'relative',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    width: SCREEN_WIDTH,
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
