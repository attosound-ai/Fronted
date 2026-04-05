/**
 * VideoMessagePlayer — renders a video message inside a gifted-chat bubble.
 *
 * Lazy-loads expo-video on first render to avoid crashing when the native
 * module isn't linked yet.
 */

import { useState, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Play } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { COLORS } from '@/constants/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;
const VIDEO_WIDTH = SCREEN_WIDTH * 0.65;
const VIDEO_HEIGHT = VIDEO_WIDTH * (9 / 16);

interface VideoMessagePlayerProps {
  videoUrl: string;
}

export function VideoMessagePlayer({ videoUrl }: VideoMessagePlayerProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [VideoModule, setVideoModule] = useState<any>(null);
  const [loadError, setLoadError] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    import('expo-video')
      .then((mod) => setVideoModule(mod))
      .catch(() => setLoadError(true));
  }, []);

  if (loadError) {
    return (
      <View style={styles.container}>
        <Text style={styles.fallbackText}>Video unavailable</Text>
      </View>
    );
  }

  if (!VideoModule) {
    return (
      <View style={styles.container}>
        <View style={styles.placeholder}>
          <Play size={24} color={COLORS.white} fill={COLORS.white} />
        </View>
      </View>
    );
  }

  const { VideoView, useVideoPlayer } = VideoModule;

  return (
    <VideoViewWrapper
      VideoView={VideoView}
      useVideoPlayer={useVideoPlayer}
      videoUrl={videoUrl}
    />
  );
}

/**
 * Separate component so the hook call is unconditional.
 */
function VideoViewWrapper({
  VideoView,
  useVideoPlayer,
  videoUrl,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  VideoView: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useVideoPlayer: any;
  videoUrl: string;
}) {
  const player = useVideoPlayer(videoUrl, (p: { loop: boolean }) => {
    p.loop = false;
  });

  return (
    <View style={styles.container}>
      <VideoView player={player} style={styles.video} contentFit="cover" nativeControls />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackText: {
    color: COLORS.gray[500],
    fontSize: 13,
    textAlign: 'center',
    padding: 16,
    fontFamily: 'Archivo_400Regular',
  },
});
