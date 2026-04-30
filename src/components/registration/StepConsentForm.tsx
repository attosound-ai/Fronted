import React, { useState, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { AlertCircle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StepProps } from '@/types/registration';
import type { InmateLookupResponse } from '@/types';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Checkbox } from '@/components/ui/Checkbox';
import { Select, SelectOption } from '@/components/ui/Select';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { authService } from '@/lib/api/authService';
import { isNotEmpty, isValidInmateNumber } from '@/utils/validators';
import { getErrorMessage } from '@/utils/formatters';
import { haptic } from '@/lib/haptics/hapticService';

const AVAILABLE_STATES: SelectOption[] = [{ label: 'Connecticut', value: 'CT' }];

function InmateCell({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <View style={styles.inmateCell}>
      <Text style={styles.inmateLabel}>{label}</Text>
      <Text style={styles.inmateValue}>{value}</Text>
    </View>
  );
}

/**
 * Step 6: Creator Consent Form
 * Collects creator information, verifies inmate identity, and consent
 */
export const StepConsentForm: React.FC<StepProps> = ({
  state,
  dispatch,
  onNext,
  onBack,
  isLoading,
  apiError,
}) => {
  const { t } = useTranslation(['registration', 'common']);
  const { t: tv } = useTranslation('validation');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [inmateData, setInmateData] = useState<InmateLookupResponse | null>(null);
  const [showInmateModal, setShowInmateModal] = useState(false);

  const relationshipOptions: SelectOption[] = [
    { label: t('consentForm.relationshipFamily'), value: 'family' },
    { label: t('consentForm.relationshipFriend'), value: 'friend' },
    { label: t('consentForm.relationshipManager'), value: 'manager' },
  ];

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!state.relationship) {
      newErrors.relationship = tv('relationshipRequired');
    }
    if (!isNotEmpty(state.creatorName || '')) {
      newErrors.creatorName = tv('creatorNameRequired');
    }
    if (!isValidInmateNumber(state.inmateNumber || '')) {
      newErrors.inmateNumber = tv('inmateNumberInvalid');
    }
    if (!state.inmateState) {
      newErrors.inmateState = tv('stateRequired');
    }
    if (!state.consentToRecording) {
      newErrors.consentToRecording = tv('consentRequired');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleContinue = async () => {
    if (!validate()) {
      haptic('error');
      return;
    }

    haptic('light');
    setLookupLoading(true);
    setLookupError(null);
    try {
      const data = await authService.lookupInmate(state.inmateState, state.inmateNumber);
      setInmateData(data);
      setShowInmateModal(true);
    } catch (error: unknown) {
      setLookupError(getErrorMessage(error, t('consentForm.lookupFailed')));
      haptic('error');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleConfirmInmate = () => {
    if (inmateData?.inmateName) {
      // Convert "PERRY,LAWRENCE" → "Lawrence Perry"
      const parts = inmateData.inmateName.split(',').map((p) => p.trim());
      const formatted =
        parts.length === 2
          ? `${parts[1].charAt(0).toUpperCase()}${parts[1].slice(1).toLowerCase()} ${parts[0].charAt(0).toUpperCase()}${parts[0].slice(1).toLowerCase()}`
          : inmateData.inmateName;
      dispatch({ type: 'UPDATE_FIELD', field: 'creatorName', value: formatted });
      dispatch({ type: 'UPDATE_FIELD', field: 'creatorDisplayName', value: formatted });
    }
    setShowInmateModal(false);
    haptic('success');
    onNext();
  };

  const handleRejectInmate = () => {
    setShowInmateModal(false);
    setInmateData(null);
  };

  const consentLabel = useMemo(() => {
    const raw = t('consentForm.consentCheckbox');
    const match = raw.match(/^(.*?)<bold>(.*?)<\/bold>(.*)$/s);
    const before = match ? match[1] : raw;
    const bold = match ? match[2] : '';
    const after = match ? match[3] : '';
    return (
      <Text style={styles.checkboxLabel}>
        {before}
        <Text style={styles.boldText}>{bold}</Text>
        {after}
      </Text>
    );
  }, [t]);

  return (
    <View style={styles.container}>
      <KeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        bottomOffset={16}
      >
        {/* Form fields */}
        <View style={styles.form}>
          <Select
            label={t('consentForm.relationshipLabel')}
            options={relationshipOptions}
            value={state.relationship || null}
            onChange={(value) => {
              dispatch({ type: 'UPDATE_FIELD', field: 'relationship', value });
              setErrors((prev) => ({ ...prev, relationship: '' }));
            }}
            error={errors.relationship}
          />

          <Input
            label={t('consentForm.creatorNameLabel')}
            value={state.creatorName || ''}
            onChangeText={(value) => {
              dispatch({ type: 'UPDATE_FIELD', field: 'creatorName', value });
              dispatch({ type: 'UPDATE_FIELD', field: 'creatorDisplayName', value });
              setErrors((prev) => ({ ...prev, creatorName: '' }));
            }}
            error={errors.creatorName}
            placeholder={t('consentForm.creatorNamePlaceholder')}
          />

          {/* Inmate number + State on same row */}
          <View style={styles.inlineRow}>
            <View style={styles.inlineField}>
              <Input
                label={t('consentForm.inmateNumberLabel')}
                value={state.inmateNumber || ''}
                onChangeText={(value) => {
                  dispatch({ type: 'UPDATE_FIELD', field: 'inmateNumber', value });
                  setErrors((prev) => ({ ...prev, inmateNumber: '' }));
                }}
                keyboardType="number-pad"
                error={errors.inmateNumber}
                placeholder={t('consentForm.inmateNumberPlaceholder')}
              />
            </View>
            <View style={styles.inlineField}>
              <Select
                label={t('consentForm.stateLabel')}
                placeholder={t('consentForm.statePlaceholder')}
                options={AVAILABLE_STATES}
                value={state.inmateState || null}
                onChange={(value) => {
                  dispatch({ type: 'UPDATE_FIELD', field: 'inmateState', value });
                  setErrors((prev) => ({ ...prev, inmateState: '' }));
                }}
                error={errors.inmateState}
                footer={
                  <Text variant="small" style={styles.disclaimer}>
                    {t('consentForm.stateDisclaimer')}
                  </Text>
                }
              />
            </View>
          </View>

          {lookupError && (
            <View style={styles.lookupErrorContainer}>
              <AlertCircle size={18} color="#FFFFFF" strokeWidth={2.25} />
              <Text variant="small" style={styles.lookupErrorText}>
                {lookupError}
              </Text>
            </View>
          )}

          <Checkbox
            checked={state.consentToRecording || false}
            onToggle={(value) => {
              dispatch({ type: 'UPDATE_FIELD', field: 'consentToRecording', value });
              setErrors((prev) => ({ ...prev, consentToRecording: '' }));
            }}
            label={consentLabel}
            error={errors.consentToRecording}
          />
        </View>

        {/* API Error */}
        {apiError && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{apiError}</Text>
          </View>
        )}

        <View style={styles.buttonWrapper}>
          <Button
            title={t('common:buttons.continue')}
            onPress={handleContinue}
            disabled={isLoading || lookupLoading}
            loading={isLoading || lookupLoading}
          />
        </View>
      </KeyboardAwareScrollView>

      {/* Inmate Verification BottomSheet */}
      <BottomSheet
        visible={showInmateModal}
        onClose={handleRejectInmate}
        title={t('consentForm.confirmTitle')}
      >
        {inmateData && (
          <View>
            <View style={styles.inmateGrid}>
              <InmateCell
                label={t('consentForm.inmateName')}
                value={inmateData.inmateName}
              />
              <InmateCell
                label={t('consentForm.inmateNumber')}
                value={inmateData.inmateNumber}
              />
              <InmateCell
                label={t('consentForm.dateOfBirth')}
                value={inmateData.dateOfBirth}
              />
              <InmateCell
                label={t('consentForm.location')}
                value={inmateData.currentLocation}
              />
              <InmateCell label={t('consentForm.status')} value={inmateData.status} />
              <InmateCell label={t('consentForm.offense')} value={inmateData.offense} />
              <InmateCell
                label={t('consentForm.sentenceDate')}
                value={inmateData.sentenceDate}
              />
              <InmateCell
                label={t('consentForm.maxSentence')}
                value={inmateData.maxSentence}
              />
              <InmateCell
                label={t('consentForm.maxRelease')}
                value={inmateData.maxReleaseDate}
              />
              <InmateCell
                label={t('consentForm.estRelease')}
                value={inmateData.estReleaseDate}
              />
            </View>

            <View style={styles.modalButtons}>
              <Button
                title={t('consentForm.confirmPerson')}
                onPress={handleConfirmInmate}
              />
              <Button
                title={t('consentForm.notThisPerson')}
                onPress={handleRejectInmate}
                variant="outline"
              />
            </View>
          </View>
        )}
      </BottomSheet>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  backButton: {
    padding: 4,
  },
  title: {
    flex: 1,
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 20,
    color: '#FFFFFF',
  },
  form: {
    gap: 8,
  },
  inlineRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inlineField: {
    flex: 1,
  },
  disclaimer: {
    color: '#666666',
    fontFamily: 'Archivo_400Regular',
    fontSize: 12,
    marginTop: 12,
  },
  lookupErrorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: -12,
  },
  lookupErrorText: {
    color: '#FFFFFF',
    flex: 1,
  },
  checkboxLabel: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 10,
    lineHeight: 14,
    color: '#CCCCCC',
  },
  boldText: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 10,
    lineHeight: 14,
    color: '#FFFFFF',
  },
  errorContainer: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#111111',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  errorText: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 14,
    color: '#FFFFFF',
  },
  buttonWrapper: {
    marginTop: 14,
  },
  inmateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  inmateCell: {
    width: '47%',
    backgroundColor: '#222222',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inmateLabel: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 11,
    color: '#888888',
    marginBottom: 2,
  },
  inmateValue: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 13,
    color: '#FFFFFF',
  },
  modalButtons: {
    gap: 12,
    paddingBottom: 8,
  },
});
