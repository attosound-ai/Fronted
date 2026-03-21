import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { Text, Button, BottomSheet } from '@/components/ui';
import { ImageCropModal } from '@/components/ui/ImageCropModal';
import { StepProps } from '@/types/registration';
import { useImagePicker } from '@/hooks/useImagePicker';
import { isNotEmpty, isValidUsername } from '@/utils/validators';
import { haptic } from '@/lib/haptics/hapticService';
import { authService } from '@/lib/api/authService';

interface StepProfileSetupProps extends StepProps {
  showRepQuestion?: boolean;
  onRepChoice?: (isRep: boolean) => void;
}

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

/**
 * StepProfileSetup - Step 4 of registration wizard
 * Sets up profile picture, display name (nickname), and unique @username
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
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);
  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCheckedRef = useRef('');

  const { pickFromGallery, takePhoto } = useImagePicker();

  // Generate username suggestions from name
  const suggestions = useMemo(() => {
    const name = state.name.trim();
    if (name.length < 2) return [];
    // Normalize: remove accents/diacritics, lowercase, strip non-alphanumeric
    const normalized = name
      .normalize('NFD')
      .replaceAll(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replaceAll(/[^a-z0-9\s]/g, '');
    if (normalized.length < 2) return [];
    const base = normalized.replaceAll(/\s+/g, '.');
    const baseUnderscore = normalized.replaceAll(/\s+/g, '_');
    const baseNoSep = normalized.replaceAll(/\s+/g, '');
    const rand = Math.floor(Math.random() * 100);
    return [...new Set([base, baseUnderscore, `${baseNoSep}${rand}`])].filter((s) =>
      isValidUsername(s)
    );
  }, [state.name]);

  // Debounced username availability check
  const checkUsername = useCallback((username: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const cleaned = username.toLowerCase().trim();

    if (!cleaned) {
      setUsernameStatus('idle');
      return;
    }

    if (!isValidUsername(cleaned)) {
      setUsernameStatus('invalid');
      return;
    }

    if (cleaned === lastCheckedRef.current) return;

    setUsernameStatus('checking');
    debounceRef.current = setTimeout(async () => {
      lastCheckedRef.current = cleaned;
      const available = await authService.checkUsername(cleaned);
      setUsernameStatus(available ? 'available' : 'taken');
    }, 400);
  }, []);

  useEffect(() => {
    checkUsername(state.username);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [state.username, checkUsername]);

  const handleUsernameChange = (value: string) => {
    const cleaned = value.toLowerCase().replaceAll(/[^a-z0-9._]/g, '');
    dispatch({ type: 'UPDATE_FIELD', field: 'username', value: cleaned });
  };

  const handleSuggestionPress = (suggestion: string) => {
    dispatch({ type: 'UPDATE_FIELD', field: 'username', value: suggestion });
    haptic('light');
  };

  const handleImageFromGallery = async () => {
    setShowImagePicker(false);
    const uri = await pickFromGallery();
    if (uri) {
      setPendingUri(uri);
      setShowCropModal(true);
    }
  };

  const handleTakePhoto = async () => {
    setShowImagePicker(false);
    const uri = await takePhoto();
    if (uri) {
      setPendingUri(uri);
      setShowCropModal(true);
    }
  };

  const handleCropDone = (croppedUri: string) => {
    dispatch({ type: 'UPDATE_FIELD', field: 'avatarUri', value: croppedUri });
    setShowCropModal(false);
    setPendingUri(null);
    haptic('success');
  };

  const handleCropCancel = () => {
    setShowCropModal(false);
    setPendingUri(null);
  };

  const validateAndContinue = () => {
    if (!isNotEmpty(state.username) || !isValidUsername(state.username)) {
      haptic('error');
      return;
    }
    if (usernameStatus !== 'available') {
      haptic('error');
      return;
    }
    // Auto-set displayName from name
    dispatch({ type: 'UPDATE_FIELD', field: 'displayName', value: state.name });
    haptic('light');
    onNext();
  };

  const renderUsernameStatus = () => {
    switch (usernameStatus) {
      case 'checking':
        return (
          <View style={styles.statusRow}>
            <ActivityIndicator size="small" color="#888888" />
            <Text variant="small" style={styles.statusChecking}>
              {t('profileSetup.usernameChecking')}
            </Text>
          </View>
        );
      case 'available':
        return (
          <View style={styles.statusRow}>
            <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
            <Text variant="small" style={styles.statusAvailable}>
              {t('profileSetup.usernameAvailable')}
            </Text>
          </View>
        );
      case 'taken':
        return (
          <View style={styles.statusRow}>
            <Ionicons name="close-circle" size={16} color="#888888" />
            <Text variant="small" style={styles.statusTaken}>
              {t('profileSetup.usernameTaken')}
            </Text>
          </View>
        );
      case 'invalid':
        return (
          <View style={styles.statusRow}>
            <Ionicons name="close-circle" size={16} color="#888888" />
            <Text variant="small" style={styles.statusTaken}>
              {t('profileSetup.usernameHint')}
            </Text>
          </View>
        );
      default:
        return null;
    }
  };

  const usernameBorderColor =
    usernameStatus === 'available'
      ? '#FFFFFF'
      : usernameStatus === 'taken' || usernameStatus === 'invalid'
        ? '#888888'
        : '#222222';

  const canContinue = isValidUsername(state.username) && usernameStatus === 'available';

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
          <Ionicons name="alert-circle" size={20} color="#FFFFFF" />
          <Text variant="small" style={styles.errorBannerText}>
            {apiError}
          </Text>
        </View>
      )}

      {/* Avatar Section */}
      <View style={styles.avatarSection}>
        <TouchableOpacity
          onPress={() => setShowImagePicker(true)}
          activeOpacity={0.8}
          style={styles.avatarTouchable}
        >
          {state.avatarUri ? (
            <Image source={{ uri: state.avatarUri }} style={styles.avatarCircle} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="camera" size={56} color="#666666" />
            </View>
          )}
          <View style={styles.avatarBadge}>
            <Ionicons name="camera" size={18} color="#000000" />
          </View>
        </TouchableOpacity>
        {!state.avatarUri && (
          <Text variant="small" style={styles.avatarHint}>
            {t('profileSetup.addProfilePicture')}
          </Text>
        )}
      </View>

      {/* Form */}
      <View style={styles.formArea}>
        {/* Username (@handle) */}
        <View>
          <View style={[styles.usernameWrapper, { borderColor: usernameBorderColor }]}>
            <Text style={styles.atPrefix}>@</Text>
            <TextInput
              value={state.username}
              onChangeText={handleUsernameChange}
              placeholder={t('profileSetup.usernamePlaceholder')}
              placeholderTextColor="#666666"
              style={styles.usernameInput}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
            />
            {usernameStatus === 'available' && (
              <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
            )}
            {(usernameStatus === 'taken' || usernameStatus === 'invalid') && (
              <Ionicons name="close-circle" size={20} color="#888888" />
            )}
            {usernameStatus === 'checking' && (
              <ActivityIndicator size="small" color="#888888" />
            )}
          </View>

          {renderUsernameStatus()}

          {/* Suggestions */}
          {suggestions.length > 0 &&
            (usernameStatus === 'idle' ||
              usernameStatus === 'taken' ||
              usernameStatus === 'invalid') && (
              <View style={styles.suggestionsSection}>
                <Text variant="small" style={styles.suggestionsLabel}>
                  {t('profileSetup.suggestions')}
                </Text>
                <View style={styles.suggestionsRow}>
                  {suggestions.map((s, i) => (
                    <TouchableOpacity
                      key={`${s}-${i}`}
                      style={styles.suggestionChip}
                      onPress={() => handleSuggestionPress(s)}
                      activeOpacity={0.7}
                    >
                      <Text variant="small" style={styles.suggestionText}>
                        @{s}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

          <Text variant="small" style={styles.changeAnytime}>
            {t('profileSetup.changeAnytime')}
          </Text>
        </View>

        {/* Done button */}
        <Button
          title={t('common:buttons.done')}
          onPress={validateAndContinue}
          disabled={isLoading || !canContinue}
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

      {/* Representative Question Bottom Sheet */}
      <BottomSheet visible={!!showRepQuestion} onClose={() => { onRepChoice?.(false); }}>
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
              onPress={() => {
                haptic('light');
                onRepChoice?.(true);
              }}
              variant="primary"
              loading={isLoading}
            />
            <Button
              title={t('profileSetup.noForMe')}
              onPress={() => {
                haptic('light');
                onRepChoice?.(false);
              }}
              variant="outline"
              disabled={isLoading}
            />
          </View>
        </View>
      </BottomSheet>

      {/* Crop Modal */}
      <ImageCropModal
        visible={showCropModal}
        imageUri={pendingUri}
        onCrop={handleCropDone}
        onCancel={handleCropCancel}
      />
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
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 24,
    marginTop: 12,
  },
  errorBannerText: {
    color: '#FFFFFF',
    flex: 1,
  },
  avatarSection: {
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 8,
    gap: 12,
  },
  avatarTouchable: {
    position: 'relative',
  },
  avatarCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#1A1A1A',
  },
  avatarPlaceholder: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#1A1A1A',
    borderWidth: 2,
    borderColor: '#333333',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: '#FFFFFF',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#000000',
  },
  avatarHint: {
    color: '#666666',
  },
  formArea: {
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 20,
  },
  inputWrapper: {
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
  errorText: {
    color: '#FFFFFF',
    marginTop: 6,
  },
  usernameWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111111',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#222222',
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 4,
  },
  atPrefix: {
    color: '#888888',
    fontSize: 16,
    fontFamily: 'Archivo_500Medium',
  },
  usernameInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Archivo_400Regular',
    padding: 0,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  statusChecking: {
    color: '#888888',
  },
  statusAvailable: {
    color: '#FFFFFF',
  },
  statusTaken: {
    color: '#888888',
  },
  suggestionsSection: {
    marginTop: 12,
    gap: 8,
  },
  suggestionsLabel: {
    color: '#888888',
  },
  suggestionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionChip: {
    backgroundColor: '#111111',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333333',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  suggestionText: {
    color: '#FFFFFF',
  },
  changeAnytime: {
    color: '#666666',
    textAlign: 'center',
    marginTop: 8,
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
