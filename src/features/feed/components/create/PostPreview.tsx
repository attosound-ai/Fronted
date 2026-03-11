import { useState, useEffect } from 'react';
import { View, Image, StyleSheet, Dimensions } from 'react-native';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import type { PostType } from '@/types/post';
import type { PickedMedia } from './MediaPicker';

const SCREEN_WIDTH = Dimensions.get('window').width;

interface PostPreviewProps {
  postType: PostType;
  media: PickedMedia[];
  caption: string;
  poemText: string;
}

export function PostPreview({ postType, media, caption, poemText }: PostPreviewProps) {
  const { t } = useTranslation('feed');
  const [videoThumb, setVideoThumb] = useState<string | null>(null);

  useEffect(() => {
    if ((postType === 'video' || postType === 'reel') && media[0]) {
      VideoThumbnails.getThumbnailAsync(media[0].uri, { time: 0 })
        .then(({ uri }) => setVideoThumb(uri))
        .catch(() => {});
    }
  }, [media, postType]);

  return (
    <View style={styles.container}>
      <Text variant="h2" style={styles.title}>
        {t('create.previewTitle')}
      </Text>

      {/* Media preview */}
      {postType === 'image' && media.length > 0 && (
        <Image
          source={{ uri: media[0].uri }}
          style={styles.imagePreview}
          resizeMode="cover"
        />
      )}

      {(postType === 'video' || postType === 'reel') && media.length > 0 && (
        <View style={[styles.videoPreview, postType === 'reel' && styles.reelPreview]}>
          {videoThumb ? (
            <Image
              source={{ uri: videoThumb }}
              style={styles.videoThumb}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.videoThumb, styles.videoPlaceholder]}>
              <Ionicons name="videocam" size={40} color="#555" />
            </View>
          )}
          <View style={styles.playOverlay}>
            <Ionicons name="play-circle" size={48} color="rgba(255,255,255,0.8)" />
          </View>
        </View>
      )}

      {postType === 'audio' && media.length > 0 && (
        <View style={styles.audioPreview}>
          <Ionicons name="musical-notes" size={40} color="#FFF" />
          <Text variant="body" style={styles.audioLabel}>
            {media[0].fileName}
          </Text>
          {media[0].duration && (
            <Text variant="caption" style={styles.durationLabel}>
              {Math.floor(media[0].duration / 60)}:
              {String(Math.floor(media[0].duration % 60)).padStart(2, '0')}
            </Text>
          )}
        </View>
      )}

      {postType === 'text' && (
        <View style={styles.poemPreview}>
          <Text variant="body" style={styles.poemText}>
            {poemText || t('create.poemEmptyPreview')}
          </Text>
        </View>
      )}

      {/* Caption */}
      {caption ? (
        <View style={styles.captionContainer}>
          <Text variant="body" style={styles.caption}>
            {caption}
          </Text>
        </View>
      ) : null}

      {media.length > 1 && (
        <Text variant="caption" style={styles.multiHint}>
          {media.length - 1 === 1
            ? t('create.multiplePhotosHintSingular', { n: media.length - 1 })
            : t('create.multiplePhotosHintPlural', { n: media.length - 1 })}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  title: {
    textAlign: 'center',
    marginBottom: 16,
  },
  imagePreview: {
    width: '100%',
    height: SCREEN_WIDTH * 1.25,
    borderRadius: 12,
    backgroundColor: '#111',
  },
  videoPreview: {
    width: '100%',
    height: SCREEN_WIDTH * 0.5625,
    borderRadius: 12,
    backgroundColor: '#111',
    overflow: 'hidden',
    position: 'relative',
  },
  reelPreview: {
    height: SCREEN_WIDTH * 1.25,
  },
  videoThumb: {
    width: '100%',
    height: '100%',
  },
  videoPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#222',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  audioPreview: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 40,
    backgroundColor: '#111',
    borderRadius: 12,
  },
  audioLabel: {
    color: '#CCC',
    fontSize: 14,
  },
  durationLabel: {
    color: '#666',
  },
  poemPreview: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 24,
    minHeight: SCREEN_WIDTH * 1.25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  poemText: {
    color: '#FFF',
    fontSize: 18,
    lineHeight: 28,
    textAlign: 'center',
    fontFamily: 'Archivo_600SemiBold',
  },
  captionContainer: {
    marginTop: 12,
  },
  caption: {
    color: '#CCC',
    fontSize: 14,
  },
  multiHint: {
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
});
