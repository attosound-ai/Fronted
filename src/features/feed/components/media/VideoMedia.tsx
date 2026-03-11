import { useState, useCallback, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { cloudinaryUrl } from '@/lib/media/cloudinaryUrl';
import type { FeedPost } from '@/types/post';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface VideoMediaProps {
  post: FeedPost;
  isVisible?: boolean;
}

export function VideoMedia({ post, isVisible = false }: VideoMediaProps) {
  const [isMuted, setIsMuted] = useState(true);
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
        <Ionicons name="videocam-off-outline" size={48} color="#666" />
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
      <TouchableOpacity style={styles.muteButton} onPress={toggleMute} hitSlop={8}>
        <Ionicons name={isMuted ? 'volume-mute' : 'volume-high'} size={18} color="#FFF" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 1.25,
    backgroundColor: '#000',
    position: 'relative',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 1.25,
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
