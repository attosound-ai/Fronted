import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { KeyboardAwareScrollView, useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import ReAnimated, { useAnimatedStyle, interpolate, Extrapolation } from 'react-native-reanimated';
import { AlertCircle, Camera, Images, CheckCircle, XCircle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text, Button, BottomSheet } from '@/components/ui';
import { ImageCropModal } from '@/components/ui/ImageCropModal';
import { StepProps } from '@/types/registration';
import { useImagePicker } from '@/hooks/useImagePicker';
import { isNotEmpty, isValidUsername } from '@/utils/validators';
import { haptic } from '@/lib/haptics/hapticService';
import { authService } from '@/lib/api/authService';

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

/**
 * StepCreatorProfile - Step 10: Avatar, displayName (editable), @username with availability check
 */
export function StepCreatorProfile({
  state,
  dispatch,
  onNext,
  isLoading,
  apiError,
}: StepProps) {
  const { t } = useTranslation(['registration', 'common']);
  const { height: screenHeight } = useWindowDimensions();
  const baseAvatarSize = screenHeight < 930 ? 220 : 260;
  const { height: kbHeight } = useReanimatedKeyboardAnimation();
  const shrunkSize = baseAvatarSize * 0.75;
  const avatarAnimStyle = useAnimatedStyle(() => {
    const size = interpolate(
      kbHeight.value,
      [0, -250],
      [baseAvatarSize, shrunkSize],
      Extrapolation.CLAMP,
    );
    return {
      width: size,
      height: size,
      borderRadius: size / 2,
    };
  });
  const avatarSize = baseAvatarSize;
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);
  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCheckedRef = useRef('');

  const { pickFromGallery, takePhoto } = useImagePicker();

  // Don't pre-fill — let user choose their own nickname

  // Username suggestions
  const suggestions = useMemo(() => {
    const name = state.creatorDisplayName.trim();
    if (name.length < 2) return [];
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
  }, [state.creatorDisplayName]);

  // Debounced username check
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
    checkUsername(state.creatorUsername);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [state.creatorUsername, checkUsername]);

  const handleUsernameChange = (value: string) => {
    const cleaned = value.toLowerCase().replaceAll(/[^a-z0-9._]/g, '');
    dispatch({ type: 'UPDATE_FIELD', field: 'creatorUsername', value: cleaned });
  };

  const handleSuggestionPress = (suggestion: string) => {
    dispatch({ type: 'UPDATE_FIELD', field: 'creatorUsername', value: suggestion });
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
    dispatch({ type: 'UPDATE_FIELD', field: 'creatorAvatarUri', value: croppedUri });
    setShowCropModal(false);
    setPendingUri(null);
    haptic('success');
  };

  const handleCropCancel = () => {
    setShowCropModal(false);
    setPendingUri(null);
  };

  const canContinue =
    isValidUsername(state.creatorUsername) && usernameStatus === 'available';

  const handleContinue = () => {
    if (!canContinue) {
      haptic('error');
      return;
    }
    haptic('light');
    onNext();
  };

  const borderFor =
    usernameStatus === 'available'
      ? '#FFFFFF'
      : usernameStatus === 'taken' || usernameStatus === 'invalid'
        ? '#888888'
        : '#222222';

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      bottomOffset={80}
      showsVerticalScrollIndicator={false}
    >
      <Text variant="h2" style={styles.title}>
        {t('creatorAccountSetup.profileTitle')}
      </Text>
      <Text variant="body" style={styles.subtitle}>
        {t('creatorAccountSetup.profileSubtitle')}
      </Text>

      {apiError && (
        <View style={styles.errorBanner}>
          <AlertCircle size={20} color="#FFFFFF" strokeWidth={2.25} />
          <Text variant="small" style={styles.errorBannerText}>
            {apiError}
          </Text>
        </View>
      )}

      {/* Avatar — shrinks when keyboard is open */}
      <ReAnimated.View style={[styles.avatarSection, avatarAnimStyle]}>
        <TouchableOpacity
          onPress={() => setShowImagePicker(true)}
          activeOpacity={0.8}
          style={styles.avatarTouchable}
        >
          {state.creatorAvatarUri ? (
            <Image
              source={{ uri: state.creatorAvatarUri }}
              style={[styles.avatarCircle, { width: '100%', height: '100%', borderRadius: avatarSize }]}
            />
          ) : (
            <View style={[styles.avatarPlaceholder, { width: '100%', height: '100%', borderRadius: avatarSize }]}>
              <Camera size={56} color="#666666" strokeWidth={2.25} />
            </View>
          )}
          <View style={styles.avatarBadge}>
            <Camera size={18} color="#000000" strokeWidth={2.25} />
          </View>
        </TouchableOpacity>
      </ReAnimated.View>

      <View style={styles.formArea}>
        {/* Username */}
        <View>
          <View style={[styles.usernameWrapper, { borderColor: borderFor }]}>
            <Text style={styles.atPrefix}>@</Text>
            <TextInput
              value={state.creatorUsername}
              onChangeText={handleUsernameChange}
              placeholder={t('profileSetup.usernamePlaceholder')}
              placeholderTextColor="#666666"
              style={styles.usernameInput}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
            />
            {usernameStatus === 'available' && (
              <CheckCircle size={20} color="#FFFFFF" strokeWidth={2.25} />
            )}
            {(usernameStatus === 'taken' || usernameStatus === 'invalid') && (
              <XCircle size={20} color="#888888" strokeWidth={2.25} />
            )}
            {usernameStatus === 'checking' && (
              <ActivityIndicator size="small" color="#888888" />
            )}
          </View>

          {usernameStatus === 'checking' && (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color="#888888" />
              <Text variant="small" style={styles.statusMuted}>
                {t('profileSetup.usernameChecking')}
              </Text>
            </View>
          )}
          {usernameStatus === 'available' && (
            <View style={styles.statusRow}>
              <CheckCircle size={16} color="#FFFFFF" strokeWidth={2.25} />
              <Text variant="small" style={styles.statusWhite}>
                {t('profileSetup.usernameAvailable')}
              </Text>
            </View>
          )}
          {usernameStatus === 'taken' && (
            <View style={styles.statusRow}>
              <XCircle size={16} color="#888888" strokeWidth={2.25} />
              <Text variant="small" style={styles.statusMuted}>
                {t('profileSetup.usernameTaken')}
              </Text>
            </View>
          )}
          {usernameStatus === 'invalid' && (
            <View style={styles.statusRow}>
              <XCircle size={16} color="#888888" strokeWidth={2.25} />
              <Text variant="small" style={styles.statusMuted}>
                {t('profileSetup.usernameHint')}
              </Text>
            </View>
          )}

          {/* Suggestions */}
          {suggestions.length > 0 &&
            (usernameStatus === 'idle' ||
              usernameStatus === 'taken' ||
              usernameStatus === 'invalid') && (
              <View style={styles.suggestionsSection}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.suggestionsRow}
                >
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
                </ScrollView>
              </View>
            )}
        </View>

        <Button
          title={t('common:buttons.continue')}
          onPress={handleContinue}
          disabled={isLoading || !canContinue}
          loading={isLoading}
        />
      </View>

      {/* Image Picker Bottom Sheet */}
      <BottomSheet
        visible={showImagePicker}
        onClose={() => setShowImagePicker(false)}
        title={t('creatorAccountSetup.uploadPhotoTitle')}
      >
        <View style={styles.pickerOptions}>
          <TouchableOpacity
            style={[styles.pickerOption, styles.pickerOptionPrimary]}
            onPress={handleImageFromGallery}
            activeOpacity={0.7}
          >
            <Images size={20} color="#000000" strokeWidth={2.25} />
            <Text variant="body" style={styles.pickerOptionPrimaryText}>
              {t('creatorAccountSetup.chooseFromGallery')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.pickerOption}
            onPress={handleTakePhoto}
            activeOpacity={0.7}
          >
            <Camera size={20} color="#FFFFFF" strokeWidth={2.25} />
            <Text variant="body" style={styles.pickerOptionText}>
              {t('creatorAccountSetup.takePhoto')}
            </Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

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
  container: { flex: 1, backgroundColor: '#000000' },
  scrollContent: { flexGrow: 1, paddingBottom: 40 },
  title: { color: '#FFFFFF', textAlign: 'center', marginTop: 24, marginBottom: 4 },
  subtitle: { color: '#888888', textAlign: 'center', marginBottom: 16 },
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
    marginBottom: 12,
  },
  errorBannerText: { color: '#FFFFFF', flex: 1 },
  avatarSection: { alignItems: 'center', alignSelf: 'center', paddingTop: 12, paddingBottom: 8 },
  avatarTouchable: { position: 'relative', width: '100%', aspectRatio: 1 },
  avatarCircle: {
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#1A1A1A',
  },
  avatarPlaceholder: {
    width: 260,
    height: 260,
    borderRadius: 130,
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
  avatarHint: { color: '#666666' },
  formArea: { paddingHorizontal: 24, paddingTop: 32, gap: 20 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111111',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#222222',
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 8,
  },
  textInput: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Archivo_400Regular',
    padding: 0,
    flex: 1,
  },
  usernameWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111111',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#222222',
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 4,
  },
  atPrefix: { color: '#888888', fontSize: 16, fontFamily: 'Archivo_500Medium' },
  usernameInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Archivo_400Regular',
    padding: 0,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  statusMuted: { color: '#888888' },
  statusWhite: { color: '#FFFFFF' },
  suggestionsSection: { marginTop: 10, gap: 8 },
  suggestionsLabel: { color: '#888888' },
  suggestionsRow: { flexDirection: 'row', gap: 8 },
  suggestionChip: {
    backgroundColor: '#111111',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333333',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  suggestionText: { color: '#FFFFFF' },
  changeAnytime: { color: '#666666', textAlign: 'center', marginTop: 8 },
  pickerOptions: { gap: 24, paddingVertical: 8 },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    borderRadius: 9999,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  pickerOptionPrimary: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  pickerOptionPrimaryText: {
    color: '#000000',
    fontSize: 15,
    fontFamily: 'Archivo_500Medium',
  },
  pickerOptionText: { color: '#FFFFFF', fontSize: 15, fontFamily: 'Archivo_500Medium' },
});
