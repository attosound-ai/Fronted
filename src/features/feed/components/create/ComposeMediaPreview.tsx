import { useState, useEffect } from 'react';
import {
  View,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { XCircle, Plus, Music, PlayCircle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import type { PostType } from '@/types/post';
import type { PickedMedia } from '../../types';

interface ComposeMediaPreviewProps {
  attachmentType: PostType;
  media: PickedMedia[];
  onRemoveMedia: (index: number) => void;
  onAddMore: () => void;
}

export function ComposeMediaPreview({
  attachmentType,
  media,
  onRemoveMedia,
  onAddMore,
}: ComposeMediaPreviewProps) {
  const { t } = useTranslation('feed');

  if (media.length === 0) return null;

  if (attachmentType === 'image') {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.imageRow}
      >
        {media.map((m, i) => (
          <View key={m.uri} style={styles.imageTile}>
            <Image source={{ uri: m.uri }} style={styles.imageThumb} />
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => onRemoveMedia(i)}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <XCircle size={20} color="#FFFFFF" strokeWidth={2.25} />
            </TouchableOpacity>
          </View>
        ))}
        {media.length < 10 && (
          <TouchableOpacity style={styles.addMoreTile} onPress={onAddMore}>
            <Plus size={28} color="#888888" strokeWidth={2.25} />
          </TouchableOpacity>
        )}
      </ScrollView>
    );
  }

  if (attachmentType === 'video' || attachmentType === 'reel') {
    return <VideoPreview media={media[0]} onRemove={() => onRemoveMedia(0)} />;
  }

  if (attachmentType === 'audio') {
    const m = media[0];
    return (
      <View style={styles.audioCard}>
        <Music size={24} color="#FFFFFF" strokeWidth={2.25} />
        <View style={styles.audioInfo}>
          <Text variant="body" style={styles.audioName} numberOfLines={1}>
            {m.fileName}
          </Text>
          {m.duration != null && (
            <Text variant="small" style={styles.audioDuration}>
              {formatDuration(m.duration)}
            </Text>
          )}
        </View>
        <TouchableOpacity onPress={() => onRemoveMedia(0)}>
          <XCircle size={22} color="#888888" strokeWidth={2.25} />
        </TouchableOpacity>
      </View>
    );
  }

  return null;
}

function VideoPreview({
  media,
  onRemove,
}: {
  media: PickedMedia;
  onRemove: () => void;
}) {
  const [thumbnail, setThumbnail] = useState<string | null>(null);

  useEffect(() => {
    VideoThumbnails.getThumbnailAsync(media.uri, { time: 0 })
      .then(({ uri }) => setThumbnail(uri))
      .catch(() => {});
  }, [media.uri]);

  return (
    <View style={styles.videoContainer}>
      {thumbnail ? (
        <Image source={{ uri: thumbnail }} style={styles.videoThumb} />
      ) : (
        <View style={[styles.videoThumb, styles.videoPlaceholder]} />
      )}
      <View style={styles.playOverlay}>
        <PlayCircle size={40} color="#FFFFFF" strokeWidth={2.25} />
      </View>
      <TouchableOpacity
        style={styles.videoRemove}
        onPress={onRemove}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <XCircle size={22} color="#FFFFFF" strokeWidth={2.25} />
      </TouchableOpacity>
    </View>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const THUMB_SIZE = 100;

const styles = StyleSheet.create({
  imageRow: {
    paddingHorizontal: 56,
    gap: 8,
    paddingVertical: 12,
  },
  imageTile: {
    position: 'relative',
  },
  imageThumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 8,
    backgroundColor: '#111111',
  },
  removeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
  addMoreTile: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333333',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoContainer: {
    marginHorizontal: 56,
    marginVertical: 12,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  videoThumb: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#111111',
  },
  videoPlaceholder: {
    backgroundColor: '#1A1A1A',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  audioCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111111',
    borderRadius: 12,
    marginHorizontal: 56,
    marginVertical: 12,
    padding: 14,
    gap: 12,
  },
  audioInfo: {
    flex: 1,
  },
  audioName: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  audioDuration: {
    color: '#888888',
    marginTop: 2,
  },
});
