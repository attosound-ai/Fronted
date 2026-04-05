import { useRef } from 'react';
import {
  View,
  TouchableOpacity,
  ActivityIndicator,
  Text,
  StyleSheet,
} from 'react-native';
import { Pause, Play } from 'lucide-react-native';
import { AudioWaveform } from '../AudioWaveform';
import { useAudioPlayback } from '../../hooks/useAudioPlayback';
import type { FeedPost } from '@/types/post';

interface AudioMediaProps {
  post: FeedPost;
}

export function AudioMedia({ post }: AudioMediaProps) {
  const waveformWidth = useRef(0);

  const {
    isPlaying,
    isLoaded,
    isBuffering,
    progress,
    currentTime,
    duration,
    barAmplitudes,
    togglePlayPause,
    seekToFraction,
  } = useAudioPlayback(post.audioUrl);

  const showLoading = !isLoaded || isBuffering;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={togglePlayPause}
        activeOpacity={0.7}
        style={styles.playBtn}
      >
        {showLoading && isPlaying ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : isPlaying ? (
          <Pause size={22} color="#FFFFFF" strokeWidth={2.25} />
        ) : (
          <Play size={22} color="#FFFFFF" strokeWidth={2.25} />
        )}
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.9}
        style={styles.waveformWrap}
        onLayout={(e) => {
          waveformWidth.current = e.nativeEvent.layout.width;
        }}
        onPress={(e) => {
          if (waveformWidth.current > 0) {
            const x = (e.nativeEvent as unknown as { locationX: number }).locationX;
            seekToFraction(x / waveformWidth.current);
          }
        }}
      >
        <AudioWaveform
          barCount={40}
          barWidth={3}
          barGap={2}
          maxHeight={80}
          minHeight={4}
          color="#444444"
          playedColor="#888888"
          playing={isPlaying}
          progress={progress}
          amplitudes={barAmplitudes}
        />
      </TouchableOpacity>

      <Text style={styles.time}>
        {currentTime} / {duration}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1A1A1A',
    borderRadius: 0,
  },
  playBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveformWrap: {
    flex: 1,
    height: 80,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  time: {
    color: '#666666',
    fontSize: 11,
    fontFamily: 'Archivo_400Regular',
    minWidth: 70,
    textAlign: 'right',
  },
});
