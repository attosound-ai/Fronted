import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { Toast } from '@/components/ui/Toast';
import { useEditArtistContact } from '../hooks/useEditArtistContact';

// RELATIONSHIP_OPTIONS is defined inside the component so labels can be translated

/**
 * EditArtistContactScreen — Form for editing representative's artist contact info.
 *
 * Single Responsibility: Renders the edit form and delegates logic to useEditArtistContact.
 * Open/Closed: Uses existing UI components, extensible via new fields.
 */
export function EditArtistContactScreen() {
  const { t } = useTranslation('feed');
  const RELATIONSHIP_OPTIONS = [
    { label: t('verification.relationshipFamily'), value: 'family' },
    { label: t('verification.relationshipFriend'), value: 'friend' },
    { label: t('verification.relationshipManager'), value: 'manager' },
  ];
  const { form, errors, isSubmitting, updateField, save } = useEditArtistContact();

  const handleSave = async () => {
    const success = await save();
    if (success) router.back();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} activeOpacity={0.6}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text variant="h2" style={styles.headerTitle}>
          {t('verification.editTitle')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        bottomOffset={16}
      >
        <Select
          label={t('verification.labelRelationship')}
          placeholder={t('verification.placeholderRelationship')}
          options={RELATIONSHIP_OPTIONS}
          value={form.relationship || null}
          onChange={(value) => updateField('relationship', value)}
          error={errors.relationship}
        />

        <Input
          label={t('verification.labelArtistName')}
          value={form.artistName}
          onChangeText={(text) => updateField('artistName', text)}
          placeholder={t('verification.placeholderArtistName')}
          error={errors.artistName}
        />

        <Input
          label={t('verification.labelInmateNumber')}
          value={form.inmateNumber}
          onChangeText={(text) => updateField('inmateNumber', text)}
          placeholder={t('verification.placeholderInmateNumber')}
          error={errors.inmateNumber}
        />

        <Input
          label={t('verification.labelArtistEmail')}
          value={form.artistEmail}
          onChangeText={(text) => updateField('artistEmail', text)}
          placeholder={t('verification.placeholderArtistEmail')}
          keyboardType="email-address"
          autoCapitalize="none"
          error={errors.artistEmail}
        />

        <PhoneInput
          label={t('verification.labelArtistPhone')}
          countryCode={form.artistPhoneCountryCode}
          onCountryCodeChange={(code) => updateField('artistPhoneCountryCode', code)}
          phoneNumber={form.artistPhone}
          onPhoneNumberChange={(number) => updateField('artistPhone', number)}
        />

        {/* Warning */}
        <View style={styles.warningContainer}>
          <Ionicons name="warning-outline" size={16} color="#F59E0B" />
          <Text variant="small" style={styles.warningText}>
            {t('verification.warningReauthorize')}
          </Text>
        </View>

        {errors.submit && (
          <Text variant="small" style={styles.submitError}>
            {errors.submit}
          </Text>
        )}

        <Button
          title={t('verification.saveButton')}
          onPress={handleSave}
          loading={isSubmitting}
          style={styles.saveButton}
        />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#222222',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#FFFFFF',
  },
  headerSpacer: {
    width: 24,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    gap: 16,
    paddingBottom: 48,
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
    marginTop: 8,
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
  saveButton: {
    marginTop: 8,
  },
});
