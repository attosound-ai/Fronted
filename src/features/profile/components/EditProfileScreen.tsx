import { View, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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

const RELATIONSHIP_OPTIONS = [
  { label: 'Family', value: 'family' },
  { label: 'Friend', value: 'friend' },
  { label: 'Manager', value: 'manager' },
];

export function EditProfileScreen() {
  const user = useAuthStore((s) => s.user);
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
          label="Display Name"
          value={form.displayName}
          onChangeText={(text) => updateField('displayName', text)}
          placeholder="Enter display name"
          error={errors.displayName}
        />

        <Input
          label="Username"
          value={form.username}
          onChangeText={(text) => updateField('username', text)}
          placeholder="Enter username"
          autoCapitalize="none"
          error={errors.username}
        />

        <Input
          label="Bio"
          value={form.bio}
          onChangeText={(text) => updateField('bio', text)}
          placeholder="Tell us about yourself"
          multiline
          numberOfLines={3}
          style={styles.bioInput}
        />

        {/* Artist Fields */}
        {user.role === 'artist' && (
          <>
            <Input
              label="Artist Name"
              value={form.artistName}
              onChangeText={(text) => updateField('artistName', text)}
              placeholder="Enter artist name"
              error={errors.artistName}
            />
            <Input
              label="Inmate Number"
              value={form.inmateNumber}
              onChangeText={(text) => updateField('inmateNumber', text)}
              placeholder="Enter inmate number"
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
                Changing artist info will require re-verification.
              </Text>
            </View>

            <Select
              label="Relationship"
              placeholder="Select relationship"
              options={RELATIONSHIP_OPTIONS}
              value={form.relationship || null}
              onChange={(value) => updateField('relationship', value)}
              error={errors.relationship}
            />

            <Input
              label="Artist Name"
              value={form.artistName}
              onChangeText={(text) => updateField('artistName', text)}
              placeholder="Enter artist name"
              error={errors.artistName}
            />

            <Input
              label="Inmate Number"
              value={form.inmateNumber}
              onChangeText={(text) => updateField('inmateNumber', text)}
              placeholder="Enter inmate number"
              error={errors.inmateNumber}
            />

            <Input
              label="Inmate State"
              value={form.inmateState}
              onChangeText={(text) => updateField('inmateState', text)}
              placeholder="Enter inmate state"
            />

            <Input
              label="Artist Email"
              value={form.artistEmail}
              onChangeText={(text) => updateField('artistEmail', text)}
              placeholder="Enter artist email (optional)"
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.artistEmail}
            />

            <PhoneInput
              label="Artist Phone"
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
