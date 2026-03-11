import { Dimensions, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { cloudinaryUrl } from '@/lib/media/cloudinaryUrl';
import type { Post } from '@/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CELL_SIZE = (SCREEN_WIDTH - 4) / 3; // 3 columns with 2px gaps

interface ContentGridProps {
  posts: Post[];
}

function GridCell({ post }: { post: Post }) {
  const thumbnail =
    post.metadata?.thumbnailUrl ??
    (post.filePaths?.[0]
      ? cloudinaryUrl(post.filePaths[0], 'thumb', post.contentType === 'video' ? 'video' : 'image')
      : null);

  const isVideo = post.contentType === 'video' || post.contentType === 'reel';
  const isAudio = post.contentType === 'audio';
  const isText = post.contentType === 'text';
  const textPreview = post.textContent ?? post.content;

  const handlePress = () => {
    router.push({ pathname: '/post/[id]', params: { id: post.id } } as never);
  };

  return (
    <TouchableOpacity style={styles.cell} onPress={handlePress} activeOpacity={0.85}>
      {thumbnail ? (
        <Image source={{ uri: thumbnail }} style={styles.cellImage} resizeMode="cover" />
      ) : isText && textPreview ? (
        <View style={[styles.cellImage, styles.cellText]}>
          <Text style={styles.cellTextPreview} numberOfLines={5}>
            {textPreview}
          </Text>
        </View>
      ) : (
        <View style={[styles.cellImage, styles.cellPlaceholder]}>
          <Ionicons
            name={isAudio ? 'musical-notes' : isVideo ? 'film' : 'text'}
            size={28}
            color="#555"
          />
        </View>
      )}
      {isVideo && (
        <View style={styles.videoIndicator}>
          <Ionicons name="play" size={12} color="#FFF" />
        </View>
      )}
    </TouchableOpacity>
  );
}

export function ContentGrid({ posts }: ContentGridProps) {
  return (
    <FlatList
      data={posts}
      keyExtractor={(item) => item.id}
      numColumns={3}
      renderItem={({ item }) => <GridCell post={item} />}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      columnWrapperStyle={styles.row}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 2,
  },
  separator: {
    height: 2,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    backgroundColor: '#111',
    overflow: 'hidden',
  },
  cellImage: {
    width: '100%',
    height: '100%',
  },
  cellPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1A1A',
  },
  cellText: {
    backgroundColor: '#111',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  cellTextPreview: {
    color: '#AAA',
    fontSize: 10,
    lineHeight: 14,
    padding: 6,
  },
  videoIndicator: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4,
    padding: 3,
  },
});
