import { useReducer, useState, useCallback } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

import { useAuthStore } from '@/stores/authStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
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
  StepArtistBasicInfo,
  StepArtistPassword,
  StepArtistProfile,
  StepArtistTypes,
  StepArtistGenres,
  StepSubscription,
  StepBridgeNumber,
} from '@/components/registration';
import { getGenresForSelectedTypes } from '@/constants/artistData';
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
  artistEmail: '',
  artistPassword: '',
  artistConfirmPassword: '',
  artistUsername: '',
  artistDisplayName: '',
  artistPhoneCountryCode: '+1',
  artistPhoneNumber: '',
  artistAvatarUri: null,
  artistTypes: [],
  artistGenres: [],
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
  const { t, i18n } = useTranslation('common');
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);

  // If returning with a pending registration, resume at Step 4 (profile setup)
  const initialStep = user?.registrationStatus === 'pending' ? 4 : 1;

  const [currentStep, setCurrentStep] = useState(initialStep);
  const [state, dispatch] = useReducer(wizardReducer, {
    ...initialWizardState,
    // Restore email if resuming a pending registration (displayName and username are chosen fresh in Step 4)
    ...(user?.registrationStatus === 'pending' && {
      email: user.email,
    }),
  });
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [showRepQuestion, setShowRepQuestion] = useState(false);
  const [artistAvatarPublicId, setArtistAvatarPublicId] = useState<string | undefined>();
  const [artistUserId, setArtistUserId] = useState<number | null>(null);

  // Progress bar for representative flow (steps 6-10)
  const REP_START = 6;
  const REP_END = 14;
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
    setCurrentStep((s) => {
      if (s === 6) return 4;
      // If going back from subscription (13), check if genres were skipped
      if (s === 13) {
        const grouped = getGenresForSelectedTypes(state.artistTypes);
        return grouped.length === 0 ? 11 : 12;
      }
      return Math.max(1, s - 1);
    });
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
        dto.managedArtistFields = {
          email: state.artistEmail,
          password: state.artistPassword,
          username: state.artistUsername,
          displayName: state.artistDisplayName,
          ...(state.artistPhoneNumber && {
            phoneCountryCode: state.artistPhoneCountryCode,
            phoneNumber: state.artistPhoneNumber,
          }),
          ...(artistAvatarPublicId && { avatar: artistAvatarPublicId }),
          artistTypes: state.artistTypes,
          artistGenres: state.artistGenres,
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
      await authService.sendOtp({ phone: fullPhone, email: state.email, locale: i18n.language });
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
        email: state.email,
        code: state.otpCode,
      });
      dispatch({ type: 'UPDATE_FIELD', field: 'otpVerified', value: true });
      analytics.capture(ANALYTICS_EVENTS.REGISTRATION.OTP_VERIFIED);

      // Use a temporary username for pre-register; user picks their real one in Step 4
      const tempUsername = generateUsername(state.name);

      // Pre-register: creates user in DB with status "pending" and returns JWT
      await preRegister({
        email: state.email,
        password: state.password,
        displayName: state.displayName || state.name,
        username: tempUsername,
        phoneCountryCode: state.phoneCountryCode,
        phoneNumber: state.phoneNumber,
      });

      // Clear displayName so the user enters it fresh in Step 4
      dispatch({ type: 'UPDATE_FIELD', field: 'displayName', value: '' });

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
        username: state.username,
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

  // Step 11 → If selected types have no genres (only "multifaceted"/"other"), skip genre step
  const handleArtistTypesNext = () => {
    const grouped = getGenresForSelectedTypes(state.artistTypes);
    if (grouped.length === 0) {
      handleCreateArtistThenPay(); // Skip genres, create artist + go to subscription
    } else {
      goNext(); // Go to step 12 (genres)
    }
  };

  // Create the artist account BEFORE payment so the subscription is assigned to the artist
  const handleCreateArtistThenPay = async () => {
    setIsLoading(true);
    setApiError(null);
    clearError();
    try {
      console.log('[Register] handleCreateArtistThenPay: building DTO...');
      const dto: Parameters<typeof completeRegistration>[0] = {
        role: 'representative',
        inmateNumber: state.inmateNumber,
        representativeFields: {
          artistName: state.artistName,
          inmateState: state.inmateState,
          relationship: state.relationship ?? '',
          consentToRecording: state.consentToRecording,
        },
        managedArtistFields: {
          email: state.artistEmail,
          password: state.artistPassword,
          username: state.artistUsername,
          displayName: state.artistDisplayName,
          ...(state.artistPhoneNumber && {
            phoneCountryCode: state.artistPhoneCountryCode,
            phoneNumber: state.artistPhoneNumber,
          }),
          ...(artistAvatarPublicId && { avatar: artistAvatarPublicId }),
          artistTypes: state.artistTypes,
          artistGenres: state.artistGenres,
        },
      };
      console.log('[Register] Calling completeRegistration...');
      const linkedArtistId = await completeRegistration(dto);
      console.log('[Register] completeRegistration done, artistId:', linkedArtistId);
      setArtistUserId(linkedArtistId);
      console.log('[Register] Moving to step 13 (subscription)...');
      setCurrentStep(13);
      console.log('[Register] Step 13 set successfully');
    } catch (error: unknown) {
      console.error('[Register] handleCreateArtistThenPay FAILED:', error);
      setApiError(getErrorMessage(error, t('errors.registrationFailed')));
    } finally {
      setIsLoading(false);
    }
  };

  const handleArtistSetupNext = async () => {
    setIsLoading(true);
    setApiError(null);
    try {
      if (state.artistAvatarUri) {
        try {
          const publicId = await mediaService.upload(
            state.artistAvatarUri,
            'artist-avatar.jpg',
            'image/jpeg',
            'avatar'
          );
          setArtistAvatarPublicId(publicId);
        } catch (uploadError: unknown) {
          const msg = uploadError instanceof Error ? uploadError.message : t('errors.generic');
          setApiError(t('errors.uploadFailed', { message: msg }));
          return;
        }
      }
      goNext();
    } finally {
      setIsLoading(false);
    }
  };

  // Step 13 → After payment succeeds, just advance to bridge number
  const handleSubscriptionPaid = () => {
    goNext(); // Advance to step 14 (bridge number)
  };

  // Step 12 → Bridge number displayed, registration already complete
  const handleBridgeNumberNext = () => {
    // Refresh subscription so the feed shows the correct plan/entitlements
    useSubscriptionStore.getState().fetchSubscription();
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
        return <StepArtistBasicInfo {...commonProps} onNext={goNext} onBack={goBack} />;
      case 9:
        return <StepArtistPassword {...commonProps} onNext={goNext} onBack={goBack} />;
      case 10:
        return (
          <StepArtistProfile
            {...commonProps}
            onNext={handleArtistSetupNext}
            onBack={goBack}
          />
        );
      case 11:
        return <StepArtistTypes {...commonProps} onNext={handleArtistTypesNext} onBack={goBack} />;
      case 12:
        return <StepArtistGenres {...commonProps} onNext={handleCreateArtistThenPay} onBack={goBack} />;
      case 13:
        return (
          <StepSubscription
            {...commonProps}
            onNext={handleSubscriptionPaid}
            onBack={goBack}
            onSkip={() => goNext()}
            forUserId={artistUserId ?? undefined}
          />
        );
      case 14:
        return <StepBridgeNumber {...commonProps} onNext={handleBridgeNumberNext} />;
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <LanguageSelectorButton
        style={[styles.languageButton, { top: insets.top + (isRepFlow ? 26 : 16) }]}
      />
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
    right: 16,
    zIndex: 10,
  },
  progressContainer: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
});
