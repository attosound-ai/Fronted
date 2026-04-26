import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  Camera,
  AlertTriangle,
  Instagram,
  Music2,
  Youtube,
  Cloud,
  Disc3,
  Twitter,
  Globe,
  MapPin,
  Building2,
  Mail,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { Avatar } from '@/components/ui/Avatar';
import { Toast } from '@/components/ui/Toast';
import { ImageCropModal } from '@/components/ui/ImageCropModal';
import { cloudinaryUrl } from '@/lib/media/cloudinaryUrl';
import { useAuthStore } from '@/stores/authStore';
import { useImagePicker } from '@/hooks/useImagePicker';
import { useEditProfile } from '../hooks/useEditProfile';
import { EditProfileHeader } from './EditProfileHeader';
import { AvatarPickerSheet } from './AvatarPickerSheet';

export function EditProfileScreen() {
  const { t } = useTranslation('profile');
  const user = useAuthStore((s) => s.user);

  const RELATIONSHIP_OPTIONS = [
    { label: t('edit.relationshipFamily'), value: 'family' },
    { label: t('edit.relationshipFriend'), value: 'friend' },
    { label: t('edit.relationshipManager'), value: 'manager' },
  ];
  const { form, errors, isSubmitting, updateField, setAvatar, save } = useEditProfile();
  const { pickFromGallery, takePhoto } = useImagePicker();
  const [showCropModal, setShowCropModal] = useState(false);
  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const [showAvatarSheet, setShowAvatarSheet] = useState(false);

  const handleSave = async () => {
    const success = await save();
    if (success) router.back();
  };

  const openAvatarSheet = () => setShowAvatarSheet(true);
  const closeAvatarSheet = () => setShowAvatarSheet(false);

  const handleEditCurrent = () => {
    if (!form.avatarUri) return;
    setShowAvatarSheet(false);
    // Local file URIs (re-cropping a just-picked photo) pass through unchanged;
    // Cloudinary public_ids get resolved to a full delivery URL.
    const resolved = form.avatarUri.startsWith('file://')
      ? form.avatarUri
      : (cloudinaryUrl(form.avatarUri, 'original') ?? form.avatarUri);
    setPendingUri(resolved);
    setShowCropModal(true);
  };

  const handlePickFromGallery = async () => {
    setShowAvatarSheet(false);
    const uri = await pickFromGallery();
    if (uri) {
      setPendingUri(uri);
      setShowCropModal(true);
    }
  };

  const handleTakePhoto = async () => {
    setShowAvatarSheet(false);
    const uri = await takePhoto();
    if (uri) {
      setPendingUri(uri);
      setShowCropModal(true);
    }
  };

  const handleCropDone = (croppedUri: string) => {
    setAvatar(croppedUri);
    setShowCropModal(false);
    setPendingUri(null);
  };

  const handleCropCancel = () => {
    setShowCropModal(false);
    setPendingUri(null);
  };

  if (!user) return null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <EditProfileHeader onSave={handleSave} isSubmitting={isSubmitting} />

      <KeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        bottomOffset={16}
      >
        {/* Avatar Picker */}
        <TouchableOpacity
          onPress={openAvatarSheet}
          activeOpacity={0.7}
          style={styles.avatarContainer}
        >
          {form.avatarChanged && form.avatarUri ? (
            <Image source={{ uri: form.avatarUri }} style={styles.avatarImage} />
          ) : (
            <Avatar uri={form.avatarUri} size="xl" />
          )}
          <View style={styles.avatarBadge}>
            <Camera size={14} color="#000000" strokeWidth={2.25} />
          </View>
        </TouchableOpacity>

        {/* Common Fields */}
        <Input
          label={t('edit.displayNameLabel')}
          value={form.displayName}
          onChangeText={(text) => updateField('displayName', text)}
          placeholder={t('edit.displayNamePlaceholder')}
          error={errors.displayName}
        />

        <Input
          label={t('edit.usernameLabel')}
          value={form.username}
          onChangeText={(text) => updateField('username', text)}
          placeholder={t('edit.usernamePlaceholder')}
          autoCapitalize="none"
          error={errors.username}
        />

        <Input
          label={t('edit.bioLabel')}
          value={form.bio}
          onChangeText={(text) => updateField('bio', text)}
          placeholder={t('edit.bioPlaceholder')}
          multiline
          numberOfLines={3}
          style={styles.bioInput}
        />

        {/* Social Links + Extended Bio */}
        {
          <>
            <Text
              style={styles.sectionTitle}
              numberOfLines={1}
              maxFontSizeMultiplier={1.1}
            >
              Social Links
            </Text>
            <Input
              label="Instagram"
              value={form.socialInstagram}
              onChangeText={(text) => updateField('socialInstagram', text)}
              placeholder="@username"
              autoCapitalize="none"
            />
            <Input
              label="TikTok"
              value={form.socialTiktok}
              onChangeText={(text) => updateField('socialTiktok', text)}
              placeholder="@username"
              autoCapitalize="none"
            />
            <Input
              label="YouTube"
              value={form.socialYoutube}
              onChangeText={(text) => updateField('socialYoutube', text)}
              placeholder="@channel"
              autoCapitalize="none"
            />
            <Input
              label="SoundCloud"
              value={form.socialSoundcloud}
              onChangeText={(text) => updateField('socialSoundcloud', text)}
              placeholder="@username"
              autoCapitalize="none"
            />
            <Input
              label="Spotify"
              value={form.socialSpotify}
              onChangeText={(text) => updateField('socialSpotify', text)}
              placeholder="Artist name or URI"
              autoCapitalize="none"
            />
            <Input
              label="X (Twitter)"
              value={form.socialTwitter}
              onChangeText={(text) => updateField('socialTwitter', text)}
              placeholder="@username"
              autoCapitalize="none"
            />
            <Input
              label="Website"
              value={form.website}
              onChangeText={(text) => updateField('website', text)}
              placeholder="https://..."
              autoCapitalize="none"
              keyboardType="url"
            />

            <Text
              style={styles.sectionTitle}
              numberOfLines={1}
              maxFontSizeMultiplier={1.1}
            >
              Extended Info
            </Text>
            <Input
              label="Location"
              value={form.location}
              onChangeText={(text) => updateField('location', text)}
              placeholder="City, State"
            />
            <Input
              label="Record Label"
              value={form.recordLabel}
              onChangeText={(text) => updateField('recordLabel', text)}
              placeholder="Independent"
            />
            <Input
              label="Booking Email"
              value={form.bookingEmail}
              onChangeText={(text) => updateField('bookingEmail', text)}
              placeholder="booking@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </>
        }

        {/* Creator Fields */}
        {user.role === 'creator' && (
          <>
            <Input
              label={t('edit.creatorNameLabel')}
              value={form.creatorName}
              onChangeText={(text) => updateField('creatorName', text)}
              placeholder={t('edit.creatorNamePlaceholder')}
              error={errors.creatorName}
            />
            <Input
              label={t('edit.inmateNumberLabel')}
              value={form.inmateNumber}
              onChangeText={(text) => updateField('inmateNumber', text)}
              placeholder={t('edit.inmateNumberPlaceholder')}
              error={errors.inmateNumber}
            />
          </>
        )}

        {/* Representative Fields */}
        {user.role === 'representative' && (
          <>
            <View style={styles.warningContainer}>
              <AlertTriangle size={16} color="#F59E0B" strokeWidth={2.25} />
              <Text variant="small" style={styles.warningText}>
                {t('edit.warningReVerification')}
              </Text>
            </View>

            <Select
              label={t('edit.relationshipLabel')}
              placeholder={t('edit.relationshipPlaceholder')}
              options={RELATIONSHIP_OPTIONS}
              value={form.relationship || null}
              onChange={(value) => updateField('relationship', value)}
              error={errors.relationship}
            />

            <Input
              label={t('edit.creatorNameLabel')}
              value={form.creatorName}
              onChangeText={(text) => updateField('creatorName', text)}
              placeholder={t('edit.creatorNamePlaceholder')}
              error={errors.creatorName}
            />

            <Input
              label={t('edit.inmateNumberLabel')}
              value={form.inmateNumber}
              onChangeText={(text) => updateField('inmateNumber', text)}
              placeholder={t('edit.inmateNumberPlaceholder')}
              error={errors.inmateNumber}
            />

            <Input
              label={t('edit.inmateStateLabel')}
              value={form.inmateState}
              onChangeText={(text) => updateField('inmateState', text)}
              placeholder={t('edit.inmateStatePlaceholder')}
            />

            <Input
              label={t('edit.creatorEmailLabel')}
              value={form.creatorEmail}
              onChangeText={(text) => updateField('creatorEmail', text)}
              placeholder={t('edit.creatorEmailPlaceholder')}
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.creatorEmail}
            />

            <PhoneInput
              label={t('edit.creatorPhoneLabel')}
              countryCode={form.creatorPhoneCountryCode}
              onCountryCodeChange={(code) => updateField('creatorPhoneCountryCode', code)}
              phoneNumber={form.creatorPhone}
              onPhoneNumberChange={(number) => updateField('creatorPhone', number)}
            />
          </>
        )}

        {errors.submit && (
          <Text variant="small" style={styles.submitError}>
            {errors.submit}
          </Text>
        )}
      </KeyboardAwareScrollView>

      <Toast />

      <AvatarPickerSheet
        visible={showAvatarSheet}
        hasCurrentPhoto={!!form.avatarUri}
        onClose={closeAvatarSheet}
        onEditCurrent={handleEditCurrent}
        onPickFromGallery={handlePickFromGallery}
        onTakePhoto={handleTakePhoto}
      />

      <ImageCropModal
        visible={showCropModal}
        imageUri={pendingUri}
        onCrop={handleCropDone}
        onCancel={handleCropCancel}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    gap: 4,
    paddingBottom: 48,
  },
  avatarContainer: {
    alignSelf: 'center',
    marginBottom: 16,
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#222222',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#000000',
  },
  bioInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  sectionTitle: {
    color: '#888',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 4,
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#1A1A00',
    borderWidth: 1,
    borderColor: '#333300',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  warningText: {
    flex: 1,
    color: '#F59E0B',
    lineHeight: 18,
  },
  submitError: {
    color: '#EF4444',
    textAlign: 'center',
  },
});
