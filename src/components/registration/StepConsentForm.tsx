import React, { useState, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
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
 * Step 6: Artist Consent Form
 * Collects artist information, verifies inmate identity, and consent
 */
export const StepConsentForm: React.FC<StepProps> = ({
  state,
  dispatch,
  onNext,
  onBack,
  isLoading,
  apiError,
}) => {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [inmateData, setInmateData] = useState<InmateLookupResponse | null>(null);
  const [showInmateModal, setShowInmateModal] = useState(false);

  const relationshipOptions: SelectOption[] = [
    { label: 'Family', value: 'family' },
    { label: 'Friend', value: 'friend' },
    { label: 'Manager / Representative', value: 'manager' },
  ];

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!state.relationship) {
      newErrors.relationship = 'Please select your relationship';
    }
    if (!isNotEmpty(state.artistName || '')) {
      newErrors.artistName = 'Artist name is required';
    }
    if (!isValidInmateNumber(state.inmateNumber || '')) {
      newErrors.inmateNumber = 'Invalid inmate number';
    }
    if (!state.inmateState) {
      newErrors.inmateState = 'Please select a state';
    }
    if (!state.consentToRecording) {
      newErrors.consentToRecording = 'You must agree to call recording';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleContinue = async () => {
    if (!validate()) return;

    setLookupLoading(true);
    setLookupError(null);
    try {
      const data = await authService.lookupInmate(state.inmateState, state.inmateNumber);
      setInmateData(data);
      setShowInmateModal(true);
    } catch (error: unknown) {
      setLookupError(
        getErrorMessage(error, 'Inmate not found. Please check the number and try again.')
      );
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
      dispatch({ type: 'UPDATE_FIELD', field: 'artistName', value: formatted });
    }
    setShowInmateModal(false);
    onNext();
  };

  const handleRejectInmate = () => {
    setShowInmateModal(false);
    setInmateData(null);
  };

  const consentLabel = useMemo(
    () => (
      <Text style={styles.checkboxLabel}>
        I understand and agree that all{' '}
        <Text style={styles.boldText}>consent verification</Text> calls will be recorded
        for legal and security purposes.
      </Text>
    ),
    []
  );

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
        {/* Header */}
        <View style={styles.header}>
          {onBack && (
            <TouchableOpacity
              onPress={onBack}
              style={styles.backButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          )}
          <Text variant="h1" style={styles.title}>
            Artist consent is required
          </Text>
        </View>

        {/* Form fields */}
        <View style={styles.form}>
          <Select
            label="What is your relationship?"
            options={relationshipOptions}
            value={state.relationship || null}
            onChange={(value) => {
              dispatch({ type: 'UPDATE_FIELD', field: 'relationship', value });
              setErrors((prev) => ({ ...prev, relationship: '' }));
            }}
            error={errors.relationship}
          />

          <Input
            label="Artist Name"
            value={state.artistName || ''}
            onChangeText={(value) => {
              dispatch({ type: 'UPDATE_FIELD', field: 'artistName', value });
              setErrors((prev) => ({ ...prev, artistName: '' }));
            }}
            error={errors.artistName}
            placeholder="Enter artist's full name"
          />

          {/* Inmate number + State on same row */}
          <View style={styles.inlineRow}>
            <View style={styles.inlineField}>
              <Input
                label="Inmate number"
                value={state.inmateNumber || ''}
                onChangeText={(value) => {
                  dispatch({ type: 'UPDATE_FIELD', field: 'inmateNumber', value });
                  setErrors((prev) => ({ ...prev, inmateNumber: '' }));
                }}
                keyboardType="number-pad"
                error={errors.inmateNumber}
                placeholder="Enter number"
              />
            </View>
            <View style={styles.inlineField}>
              <Select
                label="State"
                placeholder="Select state"
                options={AVAILABLE_STATES}
                value={state.inmateState || null}
                onChange={(value) => {
                  dispatch({ type: 'UPDATE_FIELD', field: 'inmateState', value });
                  setErrors((prev) => ({ ...prev, inmateState: '' }));
                }}
                error={errors.inmateState}
                footer={
                  <Text variant="small" style={styles.disclaimer}>
                    More states coming soon. Currently only Connecticut is supported.
                  </Text>
                }
              />
            </View>
          </View>

          {lookupError && (
            <View style={styles.lookupErrorContainer}>
              <Ionicons name="alert-circle" size={18} color="#EF4444" />
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
            title="Continue"
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
        title="Confirm Inmate Identity"
      >
        {inmateData && (
          <View>
            <View style={styles.inmateGrid}>
              <InmateCell label="Name" value={inmateData.inmateName} />
              <InmateCell label="Inmate #" value={inmateData.inmateNumber} />
              <InmateCell label="Date of Birth" value={inmateData.dateOfBirth} />
              <InmateCell label="Location" value={inmateData.currentLocation} />
              <InmateCell label="Status" value={inmateData.status} />
              <InmateCell label="Offense" value={inmateData.offense} />
              <InmateCell label="Sentence Date" value={inmateData.sentenceDate} />
              <InmateCell label="Max Sentence" value={inmateData.maxSentence} />
              <InmateCell label="Max Release" value={inmateData.maxReleaseDate} />
              <InmateCell label="Est. Release" value={inmateData.estReleaseDate} />
            </View>

            <View style={styles.modalButtons}>
              <Button
                title="Confirm — This is the person"
                onPress={handleConfirmInmate}
              />
              <Button
                title="Not this person"
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
    fontFamily: 'Poppins_600SemiBold',
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
    fontFamily: 'Poppins_400Regular',
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
    color: '#EF4444',
    flex: 1,
  },
  checkboxLabel: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 10,
    lineHeight: 14,
    color: '#CCCCCC',
  },
  boldText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 10,
    lineHeight: 14,
    color: '#FFFFFF',
  },
  errorContainer: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#2D1515',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  errorText: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
    color: '#EF4444',
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
    fontFamily: 'Poppins_500Medium',
    fontSize: 11,
    color: '#888888',
    marginBottom: 2,
  },
  inmateValue: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    color: '#FFFFFF',
  },
  modalButtons: {
    gap: 12,
    paddingBottom: 8,
  },
});
