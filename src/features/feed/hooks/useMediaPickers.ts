import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import type { PickedMedia } from '../types';

/**
 * Hook that encapsulates media picker logic for the post composer.
 * Returns functions to pick images, video, or reel (from library/camera).
 * Each returns the picked media or null if the user canceled.
 */
export function useMediaPickers() {
  const pickImages = async (): Promise<PickedMedia[] | null> => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 1,
    });
    if (result.canceled) return null;
    return result.assets.map((a) => ({
      uri: a.uri,
      fileName: a.fileName ?? `photo_${Date.now()}.jpg`,
      mimeType: a.mimeType ?? 'image/jpeg',
      width: a.width,
      height: a.height,
    }));
  };

  const pickMoreImages = async (
    existing: PickedMedia[]
  ): Promise<PickedMedia[] | null> => {
    const remaining = 10 - existing.length;
    if (remaining <= 0) return null;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 1,
    });
    if (result.canceled) return null;
    const newMedia = result.assets.map((a) => ({
      uri: a.uri,
      fileName: a.fileName ?? `photo_${Date.now()}.jpg`,
      mimeType: a.mimeType ?? 'image/jpeg',
      width: a.width,
      height: a.height,
    }));
    return [...existing, ...newMedia];
  };

  const pickVideo = async (): Promise<PickedMedia | null> => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) return null;
    const a = result.assets[0];
    return {
      uri: a.uri,
      fileName: a.fileName ?? `video_${Date.now()}.mp4`,
      mimeType: a.mimeType ?? 'video/mp4',
      width: a.width,
      height: a.height,
      duration: a.duration ? a.duration / 1000 : undefined,
    };
  };

  const pickReel = async (
    fromCamera: boolean
  ): Promise<PickedMedia | null> => {
    if (fromCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') return null;
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['videos'],
        videoMaxDuration: 60,
        quality: 1,
      });
      if (result.canceled || !result.assets[0]) return null;
      const a = result.assets[0];
      return {
        uri: a.uri,
        fileName: a.fileName ?? `reel_${Date.now()}.mp4`,
        mimeType: a.mimeType ?? 'video/mp4',
        width: a.width,
        height: a.height,
        duration: a.duration ? a.duration / 1000 : undefined,
      };
    }

    // From library
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) return null;
    const a = result.assets[0];
    return {
      uri: a.uri,
      fileName: a.fileName ?? `reel_${Date.now()}.mp4`,
      mimeType: a.mimeType ?? 'video/mp4',
      width: a.width,
      height: a.height,
      duration: a.duration ? a.duration / 1000 : undefined,
    };
  };

  const pickDocumentImages = async (): Promise<PickedMedia[] | null> => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'image/*',
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets) return null;
    return result.assets.map((a) => ({
      uri: a.uri,
      fileName: a.name,
      mimeType: a.mimeType ?? 'image/jpeg',
    }));
  };

  const pickDocumentVideo = async (): Promise<PickedMedia | null> => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'video/*',
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return null;
    const a = result.assets[0];
    return {
      uri: a.uri,
      fileName: a.name,
      mimeType: a.mimeType ?? 'video/mp4',
    };
  };

  const pickDocumentAudio = async (): Promise<PickedMedia | null> => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'audio/*',
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return null;
    const a = result.assets[0];
    return {
      uri: a.uri,
      fileName: a.name,
      mimeType: a.mimeType ?? 'audio/mpeg',
    };
  };

  return {
    pickImages,
    pickMoreImages,
    pickVideo,
    pickReel,
    pickDocumentImages,
    pickDocumentVideo,
    pickDocumentAudio,
  };
}
