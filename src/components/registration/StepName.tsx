import { useState } from 'react';
import { View, StyleSheet, TextInput } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { AlertCircle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text, Button } from '@/components/ui';
import { StepProps } from '@/types/registration';
import { haptic } from '@/lib/haptics/hapticService';

/**
 * StepName - Collects the user's full name during registration
 *
 * Usage:
 *   <StepName
 *     state={state}
 *     dispatch={dispatch}
 *     onNext={handleNext}
 *     onBack={handleBack}
 *     isLoading={false}
 *     apiError={null}
 *   />
 */
export function StepName({
  state,
  dispatch,
  onNext,
  onBack,
  isLoading,
  apiError,
}: StepProps) {
  const { t } = useTranslation(['registration', 'common']);
  const [error, setError] = useState('');

  const handleNext = () => {
    if (!state.name || state.name.trim().length === 0) {
      setError(t('name.required', { defaultValue: 'Please enter your name' }));
      haptic('error');
      return;
    }

    setError('');
    haptic('light');
    onNext();
  };

  return (
    <View style={styles.container}>
      <KeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        bottomOffset={16}
      >
        {/* Subtitle (title is rendered by parent topBar) */}
        <View style={styles.header}>
          <Text variant="body" style={styles.subtitle}>
            {t('name.subtitle')}
          </Text>
        </View>

        {/* API Error Banner */}
        {apiError && (
          <View style={styles.errorBanner}>
            <AlertCircle size={20} color="#FFFFFF" strokeWidth={2.25} />
            <Text variant="small" style={styles.errorBannerText}>
              {apiError}
            </Text>
          </View>
        )}

        {/* Form */}
        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <TextInput
              value={state.name ?? ''}
              onChangeText={(value: string) => {
                dispatch({ type: 'UPDATE_FIELD', field: 'name', value });
                if (error) setError('');
              }}
              placeholder={t('name.placeholder')}
              placeholderTextColor="#666666"
              autoCapitalize="words"
              autoComplete="name"
              returnKeyType="done"
              onSubmitEditing={handleNext}
              style={[styles.nameInput, error ? styles.nameInputError : null]}
              maxFontSizeMultiplier={1.0}
            />
            {error ? (
              <Text variant="small" style={styles.inputError}>
                {error}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Continue Button */}
        <View style={styles.footer}>
          <Button
            title={t('common:buttons.continue')}
            onPress={handleNext}
            disabled={isLoading}
            loading={isLoading}
          />
        </View>
      </KeyboardAwareScrollView>
    </View>
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
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 32,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: '#FFFFFF',
  },
  subtitle: {
    color: '#888888',
    marginTop: 4,
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
    marginBottom: 24,
  },
  errorBannerText: {
    color: '#FFFFFF',
    flex: 1,
  },
  form: {
    gap: 4,
  },
  inputContainer: {
    marginBottom: 16,
  },
  nameInput: {
    backgroundColor: '#111111',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 20,
    fontSize: 15,
    color: '#FFFFFF',
    fontFamily: 'Archivo_400Regular',
    borderWidth: 1,
    borderColor: '#222222',
    // Pin lineHeight: iOS computes intrinsic input height from the OS
    // fontScale BEFORE applying maxFontSizeMultiplier — so without these
    // the box grows tall under Larger Text even though the text is capped.
    lineHeight: 20,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  nameInputError: {
    borderColor: '#EF4444',
  },
  inputError: {
    color: '#EF4444',
    marginTop: 4,
  },
  footer: {
    marginTop: 20,
  },
});
