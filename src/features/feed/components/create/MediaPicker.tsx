import { useState, useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  Image,
  TextInput,
  StyleSheet,
  Dimensions,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { ProjectPickerSheet } from '@/features/projects/components/ProjectPickerSheet';
import type { PostType } from '@/types/post';

const SCREEN_WIDTH = Dimensions.get('window').width;

export interface PickedMedia {
  uri: string;
  fileName: string;
  mimeType: string;
  width?: number;
  height?: number;
  duration?: number;
  thumbnailUri?: string;
}

interface MediaPickerProps {
  postType: PostType;
  media: PickedMedia[];
  onMediaChange: (media: PickedMedia[]) => void;
  poemText: string;
  onPoemTextChange: (text: string) => void;
}

export function MediaPicker({
  postType,
  media,
  onMediaChange,
  poemText,
  onPoemTextChange,
}: MediaPickerProps) {
  const { t } = useTranslation('feed');
  const [loading, setLoading] = useState(false);
  const [projectPickerVisible, setProjectPickerVisible] = useState(false);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

  useEffect(() => {
    media.forEach(async (m) => {
      if (m.mimeType.startsWith('video/') && !thumbnails[m.uri]) {
        try {
          const { uri } = await VideoThumbnails.getThumbnailAsync(m.uri, {
            time: 0,
          });
          setThumbnails((prev) => ({ ...prev, [m.uri]: uri }));
        } catch {
          // Silently fail — will show dark placeholder
        }
      }
    });
  }, [media]);

  const pickImages = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.8,
    });
    if (!result.canceled) {
      const picked: PickedMedia[] = result.assets.map((a) => ({
        uri: a.uri,
        fileName: a.fileName ?? `photo_${Date.now()}.jpg`,
        mimeType: a.mimeType ?? 'image/jpeg',
        width: a.width,
        height: a.height,
      }));
      onMediaChange(picked);
    }
  };

  const pickVideo = async (_vertical: boolean) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      onMediaChange([
        {
          uri: a.uri,
          fileName: a.fileName ?? `video_${Date.now()}.mp4`,
          mimeType: a.mimeType ?? 'video/mp4',
          width: a.width,
          height: a.height,
          duration: a.duration ? a.duration / 1000 : undefined,
        },
      ]);
    }
  };

  const recordVideo = async (_vertical: boolean) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
      videoMaxDuration: 600,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      onMediaChange([
        {
          uri: a.uri,
          fileName: a.fileName ?? `recorded_${Date.now()}.mp4`,
          mimeType: a.mimeType ?? 'video/mp4',
          width: a.width,
          height: a.height,
          duration: a.duration ? a.duration / 1000 : undefined,
        },
      ]);
    }
  };

  const pickAudio = async () => {
    // Use document picker for audio files - expo-image-picker doesn't support audio
    // For now, use video picker with audio extraction as workaround
    // TODO: Add expo-document-picker for proper audio file selection
    setLoading(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        const a = result.assets[0];
        onMediaChange([
          {
            uri: a.uri,
            fileName: a.fileName ?? `audio_${Date.now()}.m4a`,
            mimeType: 'audio/m4a',
            duration: a.duration ? a.duration / 1000 : undefined,
          },
        ]);
      }
    } finally {
      setLoading(false);
    }
  };

  if (postType === 'text') {
    return (
      <View style={styles.poemContainer}>
        <TextInput
          style={styles.poemInput}
          placeholder={t('create.poemPlaceholder')}
          placeholderTextColor="#555"
          multiline
          value={poemText}
          onChangeText={onPoemTextChange}
          autoFocus
        />
      </View>
    );
  }

  if (media.length > 0) {
    return (
      <View style={styles.previewContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.previewScroll}
        >
          {media.map((m, i) => {
            const isVideo = m.mimeType.startsWith('video/');
            const isAudio = m.mimeType.startsWith('audio/');
            const displayUri = isVideo ? thumbnails[m.uri] : isAudio ? null : m.uri;
            return (
              <View key={i} style={styles.previewItem}>
                {isAudio ? (
                  <View style={[styles.previewImage, styles.previewPlaceholder]}>
                    <Ionicons name="musical-notes" size={32} color="#3B82F6" />
                    <Text variant="caption" style={styles.audioFileName} numberOfLines={2}>
                      {m.fileName}
                    </Text>
                    {m.duration != null && (
                      <Text variant="caption" style={styles.audioDuration}>
                        {Math.floor(m.duration / 60)}:{String(Math.floor(m.duration % 60)).padStart(2, '0')}
                      </Text>
                    )}
                  </View>
                ) : displayUri ? (
                  <Image source={{ uri: displayUri }} style={styles.previewImage} />
                ) : (
                  <View style={[styles.previewImage, styles.previewPlaceholder]}>
                    <Ionicons name="videocam" size={32} color="#555" />
                  </View>
                )}
                {isVideo && displayUri && (
                  <View style={styles.videoIndicator}>
                    <Ionicons name="play" size={20} color="#FFF" />
                  </View>
                )}
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => onMediaChange(media.filter((_, idx) => idx !== i))}
                >
                  <Ionicons name="close-circle" size={24} color="#FFF" />
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
        {postType === 'image' && media.length < 10 && (
          <TouchableOpacity style={styles.addMoreButton} onPress={pickImages}>
            <Ionicons name="add" size={20} color="#FFF" />
            <Text variant="caption" style={styles.addMoreText}>
              {t('create.addMore')}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#FFF" />
      </View>
    );
  }

  return (
    <View style={styles.pickerContainer}>
      {postType === 'image' && (
        <TouchableOpacity style={styles.pickerButton} onPress={pickImages}>
          <Ionicons name="image-outline" size={48} color="#888" />
          <Text variant="body" style={styles.pickerText}>
            {t('create.selectPhotos')}
          </Text>
          <Text variant="caption" style={styles.pickerHint}>
            {t('create.selectPhotosHint')}
          </Text>
        </TouchableOpacity>
      )}

      {postType === 'audio' && (
        <View style={styles.videoOptions}>
          <TouchableOpacity style={[styles.pickerButton, styles.pickerButtonFlex]} onPress={pickAudio}>
            <Ionicons name="musical-notes-outline" size={40} color="#888" />
            <Text variant="body" style={styles.pickerText}>
              {t('create.selectAudio', 'Dispositivo')}
            </Text>
            <Text variant="caption" style={styles.pickerHint}>
              {t('create.selectAudioHint', 'Archivos de audio')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.pickerButton, styles.pickerButtonFlex]}
            onPress={() => setProjectPickerVisible(true)}
          >
            <Ionicons name="layers-outline" size={40} color="#3B82F6" />
            <Text variant="body" style={[styles.pickerText, { color: '#3B82F6' }]}>
              {t('create.fromProject', 'Proyecto')}
            </Text>
            <Text variant="caption" style={styles.pickerHint}>
              {t('create.fromProjectHint', 'Editor de timeline')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <ProjectPickerSheet
        visible={projectPickerVisible}
        onClose={() => setProjectPickerVisible(false)}
        onSelect={(projectId) => {
          setProjectPickerVisible(false);
          router.push(`/project/${projectId}?mode=publish`);
        }}
      />

      {(postType === 'video' || postType === 'reel') && (
        <View style={styles.videoOptions}>
          <TouchableOpacity
            style={[styles.pickerButton, styles.pickerButtonFlex]}
            onPress={() => pickVideo(postType === 'reel')}
          >
            <Ionicons name="folder-outline" size={48} color="#888" />
            <Text variant="body" style={styles.pickerText}>
              {t('create.fromLibrary')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.pickerButton, styles.pickerButtonFlex]}
            onPress={() => recordVideo(postType === 'reel')}
          >
            <Ionicons name="videocam-outline" size={48} color="#888" />
            <Text variant="body" style={styles.pickerText}>
              {t('create.recordVideo')}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  poemContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  poemInput: {
    flex: 1,
    color: '#FFF',
    fontSize: 18,
    fontFamily: 'Archivo_400Regular',
    lineHeight: 28,
    textAlignVertical: 'top',
  },
  previewContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  previewScroll: {
    flexDirection: 'row',
  },
  previewItem: {
    marginRight: 8,
    position: 'relative',
  },
  previewImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
    backgroundColor: '#111',
  },
  removeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
  addMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    alignSelf: 'center',
  },
  addMoreText: {
    color: '#FFF',
  },
  previewPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#222',
  },
  videoIndicator: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    padding: 4,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  pickerButton: {
    alignItems: 'center',
    gap: 8,
    padding: 32,
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 16,
    borderStyle: 'dashed',
    width: '100%',
  },
  pickerButtonFlex: {
    flex: 1,
    width: undefined,
    padding: 20,
  },
  pickerText: {
    color: '#CCC',
  },
  pickerHint: {
    color: '#666',
  },
  videoOptions: {
    flexDirection: 'row',
    gap: 16,
    width: '100%',
  },
  audioFileName: {
    color: '#CCC',
    fontSize: 11,
    textAlign: 'center',
    fontFamily: 'Archivo_400Regular',
    marginTop: 4,
  },
  audioDuration: {
    color: '#888',
    fontSize: 11,
    fontFamily: 'Archivo_400Regular',
  },
});
