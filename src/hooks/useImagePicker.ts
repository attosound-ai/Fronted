import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Alert, Linking } from 'react-native';

const MAX_DIMENSION = 1500;

interface UseImagePickerResult {
  pickFromGallery: () => Promise<string | null>;
  takePhoto: () => Promise<string | null>;
}

/** Downscale if either dimension exceeds MAX_DIMENSION to prevent OOM in crop modal */
async function downscaleIfNeeded(uri: string): Promise<string> {
  const asset = await ImageManipulator.manipulateAsync(uri, [], { compress: 0.9 });
  const { width, height } = asset;
  if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) return asset.uri;

  const scale = MAX_DIMENSION / Math.max(width, height);
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: Math.round(width * scale), height: Math.round(height * scale) } }],
    { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
  );
  return result.uri;
}

export function useImagePicker(): UseImagePickerResult {
  const pickFromGallery = async (): Promise<string | null> => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      if (!permission.canAskAgain) {
        Alert.alert(
          'Permission Required',
          'Please enable photo library access in Settings to set your profile picture.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
      }
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
    });

    if (result.canceled) return null;
    return downscaleIfNeeded(result.assets[0].uri);
  };

  const takePhoto = async (): Promise<string | null> => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      if (!permission.canAskAgain) {
        Alert.alert(
          'Permission Required',
          'Please enable camera access in Settings to take a photo.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
      }
      return null;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.8,
    });

    if (result.canceled) return null;
    return downscaleIfNeeded(result.assets[0].uri);
  };

  return { pickFromGallery, takePhoto };
}
