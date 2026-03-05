import { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AudioWaveform } from '../AudioWaveform';
import type { FeedPost } from '@/types/post';

interface AudioMediaProps {
  post: FeedPost;
}

export function AudioMedia({ post }: AudioMediaProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => setIsPlaying((p) => !p)} activeOpacity={0.7}>
        <Ionicons
          name={isPlaying ? 'volume-high' : 'volume-medium'}
          size={22}
          color="#999"
        />
      </TouchableOpacity>
      <View style={styles.waveformWrap}>
        <AudioWaveform
          barCount={40}
          barWidth={3}
          barGap={2}
          maxHeight={80}
          minHeight={4}
          color="#666"
          playing={isPlaying}
        />
      </View>
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
  },
  waveformWrap: {
    flex: 1,
    height: 80,
    justifyContent: 'center',
  },
});
