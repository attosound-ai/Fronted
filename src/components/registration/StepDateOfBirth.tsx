import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { ArrowLeft, AlertCircle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text, Button, DateOfBirthPicker } from '@/components/ui';
import { StepProps } from '@/types/registration';
import { haptic } from '@/lib/haptics/hapticService';

export function StepDateOfBirth({
  state,
  dispatch,
  onNext,
  onBack,
  isLoading,
  apiError,
}: StepProps) {
  const { t } = useTranslation(['registration', 'common']);
  const { t: tv } = useTranslation('validation');
  const [error, setError] = useState('');

  const validateAndContinue = () => {
    if (!state.dateOfBirth) {
      setError(tv('dobRequired'));
      haptic('error');
      return;
    }
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
        <View style={styles.header}>
          <View style={styles.headerRow}>
            {onBack && (
              <TouchableOpacity
                onPress={onBack}
                style={styles.backButton}
                activeOpacity={0.7}
              >
                <ArrowLeft size={24} color="#FFFFFF" strokeWidth={2.25} />
              </TouchableOpacity>
            )}
            <Text variant="h2" style={styles.title}>
              {t('dateOfBirth.title')}
            </Text>
          </View>
        </View>

        {apiError && (
          <View style={styles.errorBanner}>
            <AlertCircle size={20} color="#FFFFFF" strokeWidth={2.25} />
            <Text variant="small" style={styles.errorBannerText}>
              {apiError}
            </Text>
          </View>
        )}

        <DateOfBirthPicker
          value={state.dateOfBirth}
          onChange={(value) => {
            dispatch({ type: 'UPDATE_FIELD', field: 'dateOfBirth', value });
            setError('');
          }}
          error={error}
        />

        <View style={styles.footer}>
          <Button
            title={t('common:buttons.continue')}
            onPress={validateAndContinue}
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
    marginBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  footer: {
    marginTop: 24,
  },
});
