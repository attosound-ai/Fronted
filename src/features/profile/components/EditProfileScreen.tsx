import { View, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { Avatar } from '@/components/ui/Avatar';
import { Toast } from '@/components/ui/Toast';
import { useAuthStore } from '@/stores/authStore';
import { useImagePicker } from '@/hooks/useImagePicker';
import { useEditProfile } from '../hooks/useEditProfile';
import { EditProfileHeader } from './EditProfileHeader';

export function EditProfileScreen() {
  const { t } = useTranslation('profile');
  const user = useAuthStore((s) => s.user);

  const RELATIONSHIP_OPTIONS = [
    { label: t('edit.relationshipFamily'), value: 'family' },
    { label: t('edit.relationshipFriend'), value: 'friend' },
    { label: t('edit.relationshipManager'), value: 'manager' },
  ];
  const { form, errors, isSubmitting, updateField, setAvatar, save } = useEditProfile();
  const { pickFromGallery } = useImagePicker();

  const handleSave = async () => {
    const success = await save();
    if (success) router.back();
  };

  const handlePickAvatar = async () => {
    const uri = await pickFromGallery();
    if (uri) setAvatar(uri);
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
          onPress={handlePickAvatar}
          activeOpacity={0.7}
          style={styles.avatarContainer}
        >
          {form.avatarChanged && form.avatarUri ? (
            <Image source={{ uri: form.avatarUri }} style={styles.avatarImage} />
          ) : (
            <Avatar uri={form.avatarUri} size="xl" />
          )}
          <View style={styles.avatarBadge}>
            <Ionicons name="camera" size={14} color="#FFFFFF" />
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

        {/* Artist Fields */}
        {user.role === 'artist' && (
          <>
            <Input
              label={t('edit.artistNameLabel')}
              value={form.artistName}
              onChangeText={(text) => updateField('artistName', text)}
              placeholder={t('edit.artistNamePlaceholder')}
              error={errors.artistName}
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
              <Ionicons name="warning-outline" size={16} color="#F59E0B" />
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
              label={t('edit.artistNameLabel')}
              value={form.artistName}
              onChangeText={(text) => updateField('artistName', text)}
              placeholder={t('edit.artistNamePlaceholder')}
              error={errors.artistName}
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
              label={t('edit.artistEmailLabel')}
              value={form.artistEmail}
              onChangeText={(text) => updateField('artistEmail', text)}
              placeholder={t('edit.artistEmailPlaceholder')}
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.artistEmail}
            />

            <PhoneInput
              label={t('edit.artistPhoneLabel')}
              countryCode={form.artistPhoneCountryCode}
              onCountryCodeChange={(code) => updateField('artistPhoneCountryCode', code)}
              phoneNumber={form.artistPhone}
              onPhoneNumberChange={(number) => updateField('artistPhone', number)}
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
    backgroundColor: '#3B82F6',
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
