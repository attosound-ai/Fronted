import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, AlertTriangle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { Toast } from '@/components/ui/Toast';
import { useEditCreatorContact } from '../hooks/useEditCreatorContact';

// RELATIONSHIP_OPTIONS is defined inside the component so labels can be translated

/**
 * EditCreatorContactScreen — Form for editing representative's creator contact info.
 *
 * Single Responsibility: Renders the edit form and delegates logic to useEditCreatorContact.
 * Open/Closed: Uses existing UI components, extensible via new fields.
 */
export function EditCreatorContactScreen() {
  const { t } = useTranslation('feed');
  const RELATIONSHIP_OPTIONS = [
    { label: t('verification.relationshipFamily'), value: 'family' },
    { label: t('verification.relationshipFriend'), value: 'friend' },
    { label: t('verification.relationshipManager'), value: 'manager' },
  ];
  const { form, errors, isSubmitting, updateField, save } = useEditCreatorContact();

  const handleSave = async () => {
    const success = await save();
    if (success) router.back();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} activeOpacity={0.6}>
          <ArrowLeft size={24} color="#FFFFFF" strokeWidth={2.25} />
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
          label={t('verification.labelCreatorName')}
          value={form.creatorName}
          onChangeText={(text) => updateField('creatorName', text)}
          placeholder={t('verification.placeholderCreatorName')}
          error={errors.creatorName}
        />

        <Input
          label={t('verification.labelInmateNumber')}
          value={form.inmateNumber}
          onChangeText={(text) => updateField('inmateNumber', text)}
          placeholder={t('verification.placeholderInmateNumber')}
          error={errors.inmateNumber}
        />

        <Input
          label={t('verification.labelCreatorEmail')}
          value={form.creatorEmail}
          onChangeText={(text) => updateField('creatorEmail', text)}
          placeholder={t('verification.placeholderCreatorEmail')}
          keyboardType="email-address"
          autoCapitalize="none"
          error={errors.creatorEmail}
        />

        <PhoneInput
          label={t('verification.labelCreatorPhone')}
          countryCode={form.creatorPhoneCountryCode}
          onCountryCodeChange={(code) => updateField('creatorPhoneCountryCode', code)}
          phoneNumber={form.creatorPhone}
          onPhoneNumberChange={(number) => updateField('creatorPhone', number)}
        />

        {/* Warning */}
        <View style={styles.warningContainer}>
          <AlertTriangle size={16} color="#F59E0B" strokeWidth={2.25} />
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
