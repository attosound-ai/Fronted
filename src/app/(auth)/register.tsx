import { useReducer, useState, useCallback } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

import { useAuthStore } from '@/stores/authStore';
import { authService } from '@/lib/api/authService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';

import { mediaService } from '@/lib/media/mediaService';
import { ProgressBar, LanguageSelectorButton } from '@/components/ui';
import type { Role } from '@/types';
import type { RegistrationWizardState, RegistrationAction } from '@/types/registration';

import {
  StepBasicInfo,
  StepCredentials,
  StepOtpVerification,
  StepProfileSetup,
  StepHowItWorks,
  StepConsentForm,
  StepWhatHappensNext,
  StepSubscription,
  StepBridgeNumber,
} from '@/components/registration';
import { getErrorMessage } from '@/utils/formatters';

const initialWizardState: RegistrationWizardState = {
  name: '',
  email: '',
  phoneCountryCode: '+1',
  phoneNumber: '',
  confirmLegalAge: false,
  acceptTerms: false,
  otpCode: '',
  otpVerified: false,
  avatarUri: null,
  displayName: '',
  username: '',
  password: '',
  isRepresentative: null,
  relationship: null,
  artistName: '',
  inmateNumber: '',
  inmateState: '',
  consentToRecording: false,
  selectedPlan: null,
  bridgeNumber: null,
};

function wizardReducer(
  state: RegistrationWizardState,
  action: RegistrationAction
): RegistrationWizardState {
  switch (action.type) {
    case 'UPDATE_FIELD':
      return { ...state, [action.field]: action.value };
    case 'UPDATE_FIELDS':
      return { ...state, ...action.fields };
    case 'RESET':
      return initialWizardState;
    default:
      return state;
  }
}

export default function RegisterScreen() {
  const { t } = useTranslation('common');
  const user = useAuthStore((s) => s.user);

  // If returning with a pending registration, resume at Step 4 (profile setup)
  const initialStep = user?.registrationStatus === 'pending' ? 4 : 1;

  const [currentStep, setCurrentStep] = useState(initialStep);
  const [state, dispatch] = useReducer(wizardReducer, {
    ...initialWizardState,
    // Restore displayName from existing user if resuming
    ...(user?.registrationStatus === 'pending' && {
      displayName: user.displayName,
      email: user.email,
    }),
  });
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [showRepQuestion, setShowRepQuestion] = useState(false);

  // Progress bar for representative flow (steps 6-10)
  const REP_START = 6;
  const REP_END = 10;
  const REP_TOTAL = REP_END - REP_START + 1;
  const isRepFlow = currentStep >= REP_START && currentStep <= REP_END;
  const repStep = isRepFlow ? currentStep - REP_START + 1 : 0;

  const preRegister = useAuthStore((s) => s.preRegister);
  const completeRegistration = useAuthStore((s) => s.completeRegistration);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const clearError = useAuthStore((s) => s.clearError);

  // Handle Android back button
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (currentStep > 1) {
          goBack();
          return true;
        }
        if (currentStep === 1) {
          router.back();
          return true;
        }
        return false;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [currentStep])
  );

  const goNext = () => {
    setApiError(null);
    setCurrentStep((s) => s + 1);
  };

  const goBack = () => {
    setApiError(null);
    setCurrentStep((s) => (s === 6 ? 4 : Math.max(1, s - 1)));
  };

  const generateUsername = (name: string): string => {
    const base = name.toLowerCase().trim().replaceAll(/\s+/g, '.');
    const suffix = Math.floor(Math.random() * 10000);
    return `${base}.${suffix}`;
  };

  const handleCompleteRegistration = async (role: Role) => {
    setIsLoading(true);
    setApiError(null);
    clearError();

    try {
      const dto: Parameters<typeof completeRegistration>[0] = { role };

      if (role === 'representative') {
        dto.inmateNumber = state.inmateNumber;
        dto.representativeFields = {
          artistName: state.artistName,
          inmateState: state.inmateState,
          relationship: state.relationship ?? '',
          consentToRecording: state.consentToRecording,
        };
      }

      await completeRegistration(dto);
      router.replace('/(tabs)');
    } catch (error: unknown) {
      setApiError(getErrorMessage(error, t('errors.registrationFailed')));
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2 → Check phone availability, send OTP, then advance to OTP screen
  const handleCredentialsNext = async () => {
    setIsLoading(true);
    setApiError(null);
    try {
      const fullPhone = `${state.phoneCountryCode}${state.phoneNumber}`;
      await authService.checkPhone(fullPhone);
      await authService.sendOtp({ phone: fullPhone });
      analytics.capture(ANALYTICS_EVENTS.REGISTRATION.STARTED);
      analytics.capture(ANALYTICS_EVENTS.REGISTRATION.OTP_SENT);
      goNext();
    } catch (error: unknown) {
      setApiError(getErrorMessage(error, t('errors.sendOtpFailed')));
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3 → Verify OTP, then pre-register user in DB, then advance
  const handleOtpNext = async () => {
    setIsLoading(true);
    setApiError(null);
    try {
      const fullPhone = `${state.phoneCountryCode}${state.phoneNumber}`;
      await authService.verifyOtp({
        phone: fullPhone,
        code: state.otpCode,
      });
      dispatch({ type: 'UPDATE_FIELD', field: 'otpVerified', value: true });
      analytics.capture(ANALYTICS_EVENTS.REGISTRATION.OTP_VERIFIED);

      // Use the real name as displayName; generate username from original name
      const displayName = state.displayName || state.name;
      if (!state.displayName) {
        dispatch({ type: 'UPDATE_FIELD', field: 'displayName', value: displayName });
      }

      const username = generateUsername(state.name);

      // Pre-register: creates user in DB with status "pending" and returns JWT
      await preRegister({
        email: state.email,
        password: state.password,
        displayName,
        username,
        phoneCountryCode: state.phoneCountryCode,
        phoneNumber: state.phoneNumber,
      });

      goNext();
    } catch (error: unknown) {
      setApiError(getErrorMessage(error, t('errors.verificationFailed')));
    } finally {
      setIsLoading(false);
    }
  };

  // Step 4 → Upload avatar (if picked), persist profile, show rep question
  const handleProfileNext = async () => {
    setIsLoading(true);
    setApiError(null);
    try {
      let avatarPublicId: string | undefined;

      if (state.avatarUri) {
        try {
          avatarPublicId = await mediaService.upload(
            state.avatarUri,
            'avatar.jpg',
            'image/jpeg',
            'avatar'
          );
        } catch (uploadError: unknown) {
          const msg =
            uploadError instanceof Error ? uploadError.message : t('errors.generic');
          setApiError(t('errors.uploadFailed', { message: msg }));
          return;
        }
      }

      await updateProfile({
        displayName: state.displayName,
        ...(avatarPublicId && { avatar: avatarPublicId }),
      });
      analytics.capture(ANALYTICS_EVENTS.REGISTRATION.PROFILE_SETUP);
      setShowRepQuestion(true);
    } catch (error: unknown) {
      setApiError(getErrorMessage(error, t('errors.profileUpdateFailed')));
    } finally {
      setIsLoading(false);
    }
  };

  // Step 4 modal → Branching: listener completes, representative continues
  const handleRepChoice = (isRep: boolean) => {
    dispatch({ type: 'UPDATE_FIELD', field: 'isRepresentative', value: isRep });
    setShowRepQuestion(false);
    analytics.capture(ANALYTICS_EVENTS.REGISTRATION.ROLE_SELECTED, {
      role: isRep ? 'representative' : 'listener',
    });
    if (isRep) {
      setCurrentStep(6); // Skip to HowItWorks
    } else {
      handleCompleteRegistration('listener');
    }
  };

  // Step 9 → After payment, complete registration as representative, then show bridge number
  const handleSubscriptionPaid = async () => {
    setIsLoading(true);
    setApiError(null);
    clearError();
    try {
      const dto: Parameters<typeof completeRegistration>[0] = {
        role: 'representative',
        inmateNumber: state.inmateNumber,
        representativeFields: {
          artistName: state.artistName,
          inmateState: state.inmateState,
          relationship: state.relationship ?? '',
          consentToRecording: state.consentToRecording,
        },
      };
      await completeRegistration(dto);
      goNext(); // Advance to step 10 (now just informational)
    } catch (error: unknown) {
      setApiError(getErrorMessage(error, t('errors.registrationFailed')));
    } finally {
      setIsLoading(false);
    }
  };

  // Step 10 → Bridge number displayed, registration already complete
  const handleBridgeNumberNext = () => {
    router.replace('/(tabs)');
  };

  const renderStep = () => {
    const commonProps = { state, dispatch, isLoading, apiError };

    switch (currentStep) {
      case 1:
        return (
          <StepBasicInfo {...commonProps} onNext={goNext} onBack={() => router.back()} />
        );
      case 2:
        return (
          <StepCredentials
            {...commonProps}
            onNext={handleCredentialsNext}
            onBack={goBack}
          />
        );
      case 3:
        return (
          <StepOtpVerification {...commonProps} onNext={handleOtpNext} onBack={goBack} />
        );
      case 4:
        return (
          <StepProfileSetup
            {...commonProps}
            onNext={handleProfileNext}
            onBack={goBack}
            showRepQuestion={showRepQuestion}
            onRepChoice={handleRepChoice}
          />
        );
      case 6:
        return <StepHowItWorks {...commonProps} onNext={goNext} onBack={goBack} />;
      case 7:
        return <StepConsentForm {...commonProps} onNext={goNext} onBack={goBack} />;
      case 8:
        return <StepWhatHappensNext {...commonProps} onNext={goNext} onBack={goBack} />;
      case 9:
        return (
          <StepSubscription
            {...commonProps}
            onNext={handleSubscriptionPaid}
            onBack={goBack}
            onSkip={() => handleCompleteRegistration('representative')}
          />
        );
      case 10:
        return <StepBridgeNumber {...commonProps} onNext={handleBridgeNumberNext} />;
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <LanguageSelectorButton style={styles.languageButton} />
      {isRepFlow && (
        <View style={styles.progressContainer}>
          <ProgressBar steps={REP_TOTAL} currentStep={repStep} />
        </View>
      )}
      {renderStep()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  languageButton: {
    position: 'absolute',
    top: 56,
    right: 16,
    zIndex: 10,
  },
  progressContainer: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
});
