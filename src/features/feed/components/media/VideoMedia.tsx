import { View, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import type { FeedPost } from '@/types/post';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface VideoMediaProps {
  post: FeedPost;
}

export function VideoMedia(_props: VideoMediaProps) {
  return (
    <View style={styles.container}>
      <Ionicons name="play-circle-outline" size={48} color="#666" />
      <Text variant="caption" style={styles.text}>
        Video coming soon
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.75,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  text: {
    color: '#666',
  },
});
