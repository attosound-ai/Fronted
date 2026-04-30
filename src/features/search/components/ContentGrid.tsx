import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Music, Film, FileText, Play } from 'lucide-react-native';
import { cloudinaryUrl } from '@/lib/media/cloudinaryUrl';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import type { Post } from '@/types';
import type { PostFeedSource } from '@/features/feed/hooks/usePostFeed';

interface ContentGridProps {
  posts: Post[];
  onEndReached?: () => void;
  ListFooterComponent?: React.ReactElement | null;
  /** Context for infinite-scroll when a post is tapped open. */
  sourceContext?: {
    source: PostFeedSource;
    sourceUserId?: number;
    sourceQuery?: string;
    sourceContentType?: string;
  };
}

function GridCell({
  post,
  cellSize,
  sourceContext,
}: {
  post: Post;
  cellSize: number;
  sourceContext?: ContentGridProps['sourceContext'];
}) {
  const isVideo = post.contentType === 'video' || post.contentType === 'reel';
  const isAudio = post.contentType === 'audio';
  const isText = post.contentType === 'text';

  const thumbnail =
    post.metadata?.thumbnailUrl ??
    (post.filePaths?.[0]
      ? cloudinaryUrl(
          post.filePaths[0],
          isVideo ? 'video_thumb' : 'thumb',
          isVideo ? 'video' : 'image'
        )
      : null);
  const textPreview = post.textContent ?? post.content;

  const handlePress = () => {
    const params: Record<string, string> = { id: post.id };
    if (sourceContext) {
      params.source = sourceContext.source;
      if (sourceContext.sourceUserId != null) {
        params.sourceUserId = String(sourceContext.sourceUserId);
      }
      if (sourceContext.sourceQuery) params.sourceQuery = sourceContext.sourceQuery;
      if (sourceContext.sourceContentType) {
        params.sourceContentType = sourceContext.sourceContentType;
      }
    }
    router.navigate({ pathname: '/post/[id]', params } as never);
  };

  return (
    <TouchableOpacity
      style={[styles.cell, { width: cellSize, height: cellSize }]}
      onPress={handlePress}
      activeOpacity={0.85}
    >
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
          {isAudio ? (
            <Music size={28} color="#555" strokeWidth={2.25} />
          ) : isVideo ? (
            <Film size={28} color="#555" strokeWidth={2.25} />
          ) : (
            <FileText size={28} color="#555" strokeWidth={2.25} />
          )}
        </View>
      )}
      {isVideo && (
        <View style={styles.videoIndicator}>
          <Play size={12} color="#FFF" strokeWidth={2.25} />
        </View>
      )}
    </TouchableOpacity>
  );
}

export function ContentGrid({
  posts,
  onEndReached,
  ListFooterComponent,
  sourceContext,
}: ContentGridProps) {
  const { contentWidth } = useDeviceLayout();
  const cellSize = (contentWidth - 4) / 3;

  return (
    <FlatList
      data={posts}
      keyExtractor={(item) => item.id}
      numColumns={3}
      renderItem={({ item }) => (
        <GridCell post={item} cellSize={cellSize} sourceContext={sourceContext} />
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      columnWrapperStyle={styles.row}
      showsVerticalScrollIndicator={false}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.3}
      ListFooterComponent={ListFooterComponent}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      removeClippedSubviews
      maxToRenderPerBatch={9}
      windowSize={5}
      initialNumToRender={9}
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
