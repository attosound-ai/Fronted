import { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  Share,
  useWindowDimensions,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { Text, Button, BottomSheet, ProfilePreviewCard } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { StepProps } from '@/types/registration';
import { useImagePicker } from '@/hooks/useImagePicker';
import { isNotEmpty } from '@/utils/validators';

interface StepProfileSetupProps extends StepProps {
  showRepQuestion?: boolean;
  onRepChoice?: (isRep: boolean) => void;
}

/**
 * StepProfileSetup - Step 3 of registration wizard
 * Sets up profile picture and display name
 */
export function StepProfileSetup({
  state,
  dispatch,
  onNext,
  isLoading,
  apiError,
  showRepQuestion,
  onRepChoice,
}: StepProfileSetupProps) {
  const { t } = useTranslation(['registration', 'common', 'validation']);
  const [error, setError] = useState<string | null>(null);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const { height: screenHeight } = useWindowDimensions();

  const user = useAuthStore((s) => s.user);
  const { pickFromGallery, takePhoto } = useImagePicker();

  const handleShareProfile = async () => {
    const username = user?.username;
    if (!username) return;
    try {
      await Share.share({
        message: `Check out my profile on Atto Sound: atto://profile/${username}`,
      });
    } catch {
      // User cancelled or share failed — no action needed
    }
  };

  const handleImageFromGallery = async () => {
    setShowImagePicker(false);
    const uri = await pickFromGallery();
    if (uri) {
      dispatch({ type: 'UPDATE_FIELD', field: 'avatarUri', value: uri });
    }
  };

  const handleTakePhoto = async () => {
    setShowImagePicker(false);
    const uri = await takePhoto();
    if (uri) {
      dispatch({ type: 'UPDATE_FIELD', field: 'avatarUri', value: uri });
    }
  };

  const validateAndContinue = () => {
    if (!isNotEmpty(state.displayName)) {
      setError(t('validation:displayNameRequired'));
      return;
    }
    setError(null);
    onNext();
  };

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      bottomOffset={16}
      showsVerticalScrollIndicator={false}
    >
      {/* API Error Banner */}
      {apiError && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={20} color="#EF4444" />
          <Text variant="small" style={styles.errorBannerText}>
            {apiError}
          </Text>
        </View>
      )}

      {/* Avatar Section — large square area taking ~half screen */}
      <TouchableOpacity
        style={[styles.avatarArea, { height: screenHeight * 0.45 }]}
        onPress={() => setShowImagePicker(true)}
        activeOpacity={0.8}
      >
        {state.avatarUri ? (
          <Image source={{ uri: state.avatarUri }} style={styles.avatarImage} />
        ) : (
          <>
            <Ionicons name="camera" size={40} color="#666666" />
            <Text variant="body" style={styles.avatarText}>
              {t('profileSetup.addProfilePicture')}
            </Text>
          </>
        )}
      </TouchableOpacity>

      {/* Name input + icons */}
      <View style={styles.formArea}>
        <View style={styles.inputRow}>
          <View style={[styles.inputWrapper, error && { borderColor: '#EF4444' }]}>
            <TextInput
              value={state.displayName}
              onChangeText={(value) => {
                dispatch({ type: 'UPDATE_FIELD', field: 'displayName', value });
                setError(null);
              }}
              placeholder={t('profileSetup.namePlaceholder')}
              placeholderTextColor="#666666"
              style={styles.textInput}
              autoCapitalize="words"
            />
          </View>
          <TouchableOpacity
            style={styles.iconButton}
            activeOpacity={0.7}
            onPress={handleShareProfile}
          >
            <Ionicons name="send" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            activeOpacity={0.7}
            onPress={() => setShowPreview(true)}
          >
            <Ionicons name="eye-outline" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {error && (
          <Text variant="small" style={styles.errorText}>
            {error}
          </Text>
        )}

        {/* Done button below name field */}
        <Button
          title={t('common:buttons.done')}
          onPress={validateAndContinue}
          disabled={isLoading}
          loading={isLoading}
        />
      </View>

      {/* Image Picker Bottom Sheet */}
      <BottomSheet
        visible={showImagePicker}
        onClose={() => setShowImagePicker(false)}
        title={t('profileSetup.uploadPhotoTitle')}
      >
        <View style={styles.pickerOptions}>
          <TouchableOpacity
            style={[styles.pickerOption, styles.pickerOptionPrimary]}
            onPress={handleImageFromGallery}
            activeOpacity={0.7}
          >
            <Ionicons name="images-outline" size={20} color="#000000" />
            <Text variant="body" style={styles.pickerOptionPrimaryText}>
              {t('profileSetup.chooseFromGallery')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.pickerOption}
            onPress={handleTakePhoto}
            activeOpacity={0.7}
          >
            <Ionicons name="camera-outline" size={20} color="#FFFFFF" />
            <Text variant="body" style={styles.pickerOptionText}>
              {t('profileSetup.takePhoto')}
            </Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {/* Profile Preview Bottom Sheet */}
      <BottomSheet
        visible={showPreview}
        onClose={() => setShowPreview(false)}
        title={t('profileSetup.profilePreview')}
      >
        <ProfilePreviewCard
          displayName={state.displayName}
          username={user?.username}
          avatarSource={state.avatarUri}
        />
      </BottomSheet>

      {/* Representative Question Bottom Sheet */}
      <BottomSheet visible={!!showRepQuestion} onClose={() => {}}>
        <View style={styles.repContent}>
          <Text variant="h2" style={styles.repTitle}>
            {t('profileSetup.repQuestion')}
          </Text>
          <Text variant="body" style={styles.repDescription}>
            {t('profileSetup.repDescription')}
          </Text>
          <View style={styles.repButtons}>
            <Button
              title={t('profileSetup.yesRepresent')}
              onPress={() => onRepChoice?.(true)}
              variant="primary"
              loading={isLoading}
            />
            <Button
              title={t('profileSetup.noForMe')}
              onPress={() => onRepChoice?.(false)}
              variant="outline"
              disabled={isLoading}
            />
          </View>
        </View>
      </BottomSheet>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollContent: {
    flexGrow: 1,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2A1515',
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 24,
    marginTop: 12,
  },
  errorBannerText: {
    color: '#EF4444',
    flex: 1,
  },
  avatarArea: {
    width: '100%',
    backgroundColor: '#0A0A0A',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  avatarText: {
    color: '#888888',
  },
  formArea: {
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 20,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: '#111111',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#222222',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  textInput: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Archivo_400Regular',
    padding: 0,
  },
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#EF4444',
  },
  pickerOptions: {
    gap: 24,
    paddingVertical: 8,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  pickerOptionPrimary: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  pickerOptionPrimaryText: {
    color: '#000000',
    fontSize: 15,
    fontFamily: 'Archivo_500Medium',
  },
  pickerOptionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Archivo_500Medium',
  },
  repContent: {
    gap: 16,
  },
  repTitle: {
    color: '#FFFFFF',
    textAlign: 'left',
    marginBottom: 4,
  },
  repDescription: {
    color: '#CCCCCC',
    textAlign: 'left',
    lineHeight: 22,
    marginBottom: 8,
  },
  repButtons: {
    gap: 12,
    marginTop: 8,
  },
});
