import { useRef } from 'react';
import {
  View,
  TouchableOpacity,
  ActivityIndicator,
  Text,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={22} color="#fff" />
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
          color="#666"
          playedColor="#3B82F6"
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
    borderRadius: 12,
  },
  playBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#222',
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
    color: '#999',
    fontSize: 11,
    fontFamily: 'Archivo_400Regular',
    minWidth: 70,
    textAlign: 'right',
  },
});
