import { useReducer, useState, useCallback, useEffect } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

import { TouchableOpacity } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { useAuthStore } from '@/stores/authStore';
import { useCountryByIP } from '@/hooks/useCountryByIP';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { authService } from '@/lib/api/authService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';

import { mediaService } from '@/lib/media/mediaService';
import { showToast } from '@/components/ui/Toast';
import { ProgressBar } from '@/components/ui';
import type { Role } from '@/types';
import type { RegistrationWizardState, RegistrationAction } from '@/types/registration';

import {
  StepBasicInfo,
  StepName,
  StepDateOfBirth,
  StepCredentials,
  StepOtpVerification,
  StepProfileSetup,
  StepHowItWorks,
  StepConsentForm,
  StepCreatorBasicInfo,
  StepCreatorPassword,
  StepCreatorProfile,
  StepCreatorTypes,
  StepCreatorGenres,
  StepCreatorInmate,
  StepSubscription,
  StepBridgeNumber,
} from '@/components/registration';
import { getGenresForSelectedTypes } from '@/constants/creatorData';
import { getErrorMessage } from '@/utils/formatters';

const initialWizardState: RegistrationWizardState = {
  identifierMode: 'email',
  name: '',
  email: '',
  phoneCountryCode: '+1',
  phoneNumber: '',
  dateOfBirth: '',
  acceptTerms: false,
  otpCode: '',
  otpVerified: false,
  avatarUri: null,
  displayName: '',
  username: '',
  password: '',
  isRepresentative: null,
  relationship: null,
  creatorName: '',
  inmateNumber: '',
  inmateState: '',
  consentToRecording: false,
  creatorEmail: '',
  creatorPassword: '',
  creatorConfirmPassword: '',
  creatorUsername: '',
  creatorDisplayName: '',
  creatorPhoneCountryCode: '+1',
  creatorPhoneNumber: '',
  creatorAvatarUri: null,
  creatorTypes: [],
  creatorGenres: [],
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
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isCreatorMode = mode === 'creator';
  const user = useAuthStore((s) => s.user);

  // mode=creator: skip to rep flow (step 8)
  // pending registration: resume at step 6
  // default: start at step 1
  const initialStep = isCreatorMode ? 8 : user?.registrationStatus === 'pending' ? 6 : 1;

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

  // Clear stale errors whenever the step changes
  useEffect(() => {
    setApiError(null);
  }, [currentStep]);

  // Auto-detect country code from IP
  const { dial: detectedDial } = useCountryByIP();
  useEffect(() => {
    if (detectedDial) {
      dispatch({ type: 'UPDATE_FIELD', field: 'phoneCountryCode', value: detectedDial });
    }
  }, [detectedDial]);
  const [creatorAvatarPublicId, setCreatorAvatarPublicId] = useState<
    string | undefined
  >();
  const [creatorUserId, setCreatorUserId] = useState<number | null>(null);

  // Progress bar for representative flow (steps 8-16)
  const REP_START = 8;
  const REP_END = 16;
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
      if (s === 8 && isCreatorMode) {
        router.back();
        return s;
      }
      if (s === 7) return 6; // Creator inmate back → profile setup
      if (s === 8) return 6; // Rep flow back → profile setup
      // If going back from subscription (15), check if genres were skipped
      if (s === 15) {
        const grouped = getGenresForSelectedTypes(state.creatorTypes);
        return grouped.length === 0 ? 13 : 14;
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
          creatorName: state.creatorName,
          inmateState: state.inmateState,
          relationship: state.relationship ?? '',
          consentToRecording: state.consentToRecording,
        };
        dto.managedCreatorFields = {
          email: state.creatorEmail,
          password: state.creatorPassword,
          username: state.creatorUsername,
          displayName: state.creatorDisplayName,
          ...(state.creatorPhoneNumber && {
            phoneCountryCode: state.creatorPhoneCountryCode,
            phoneNumber: state.creatorPhoneNumber,
          }),
          ...(creatorAvatarPublicId && { avatar: creatorAvatarPublicId }),
          creatorTypes: state.creatorTypes,
          creatorGenres: state.creatorGenres,
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

  // Step 4 → Send OTP to active identifier, then advance to OTP screen
  const handleCredentialsNext = async () => {
    setIsLoading(true);
    setApiError(null);
    try {
      if (state.identifierMode === 'phone') {
        const fullPhone = `${state.phoneCountryCode}${state.phoneNumber}`;
        await authService.sendOtp({ phone: fullPhone, locale: i18n.language });
      } else {
        await authService.sendOtp({ email: state.email, locale: i18n.language });
      }
      analytics.capture(ANALYTICS_EVENTS.REGISTRATION.STARTED);
      analytics.capture(ANALYTICS_EVENTS.REGISTRATION.OTP_SENT);
      goNext();
    } catch (error: unknown) {
      setApiError(getErrorMessage(error, t('errors.sendOtpFailed')));
    } finally {
      setIsLoading(false);
    }
  };

  // Step 5 → Verify OTP, then pre-register user in DB, then advance
  const handleOtpNext = async () => {
    setIsLoading(true);
    setApiError(null);
    try {
      // If user already has tokens (went back and came forward again), skip re-registration
      let existingToken: string | null = null;
      try {
        existingToken = await authStorage.getToken();
      } catch {
        // SecureStore may throw when key doesn't exist yet — safe to ignore
      }
      if (existingToken) {
        dispatch({ type: 'UPDATE_FIELD', field: 'otpVerified', value: true });
        goNext();
        return;
      }

      // Verify OTP with the active identifier
      const verifyPayload: { code: string; phone?: string; email?: string } = {
        code: state.otpCode,
      };
      if (state.identifierMode === 'phone') {
        verifyPayload.phone = `${state.phoneCountryCode}${state.phoneNumber}`;
      } else {
        verifyPayload.email = state.email;
      }
      await authService.verifyOtp(verifyPayload);
      dispatch({ type: 'UPDATE_FIELD', field: 'otpVerified', value: true });
      analytics.capture(ANALYTICS_EVENTS.REGISTRATION.OTP_VERIFIED);

      // Use a temporary username for pre-register; user picks their real one in Step 6
      const tempUsername = generateUsername(state.name);

      // Pre-register: creates user in DB with status "pending" and returns JWT
      await preRegister({
        ...(state.email && { email: state.email }),
        password: state.password,
        displayName: state.name,
        username: tempUsername,
        ...(state.phoneNumber && {
          phoneCountryCode: state.phoneCountryCode,
          phoneNumber: state.phoneNumber,
        }),
        ...(state.dateOfBirth && { dateOfBirth: state.dateOfBirth }),
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
          console.warn(
            '[Register] Avatar upload failed, continuing without it:',
            uploadError
          );
          showToast(t('errors.avatarUploadSkipped'));
        }
      }

      // Check username availability — skip if it's already the user's own (resume scenario)
      const currentUser = useAuthStore.getState().user;
      if (currentUser?.username !== state.username) {
        const isAvailable = await authService.checkUsername(state.username);
        if (!isAvailable) {
          setApiError(t('errors.usernameTaken'));
          return;
        }
      }

      await updateProfile({
        displayName: state.name,
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

  // Step 4 modal → Branching: listener completes, representative/creator continues
  const handleRepChoice = (choice: 'representative' | 'creator' | 'listener') => {
    dispatch({
      type: 'UPDATE_FIELD',
      field: 'isRepresentative',
      value: choice === 'representative',
    });
    setShowRepQuestion(false);
    analytics.capture(ANALYTICS_EVENTS.REGISTRATION.ROLE_SELECTED, { role: choice });
    if (choice === 'representative') {
      console.log('[Register] Rep chose REPRESENTATIVE → going to step 8 (HowItWorks)');
      setCurrentStep(8);
    } else if (choice === 'creator') {
      console.log('[Register] Rep chose CREATOR → going to step 7 (CreatorInmate)');
      setCurrentStep(7);
    } else {
      console.log('[Register] Rep chose LISTENER → completing as listener');
      handleCompleteRegistration('listener');
    }
  };

  // Step 7 → Creator confirms inmate number, complete registration as creator, go to subscription
  const handleCreatorInmateNext = async () => {
    setIsLoading(true);
    setApiError(null);
    try {
      await completeRegistration({ role: 'creator', inmateNumber: state.inmateNumber });
      setCurrentStep(15); // Go to subscription
    } catch (error: unknown) {
      setApiError(getErrorMessage(error, t('errors.registrationFailed')));
    } finally {
      setIsLoading(false);
    }
  };

  // Step 11 → If selected types have no genres (only "multifaceted"/"other"), skip genre step
  const handleCreatorTypesNext = () => {
    const grouped = getGenresForSelectedTypes(state.creatorTypes);
    if (grouped.length === 0) {
      handleCreateCreatorThenPay(); // Skip genres, create creator + go to subscription
    } else {
      goNext(); // Go to step 12 (genres)
    }
  };

  // Create the creator account BEFORE payment so the subscription is assigned to the creator
  const handleCreateCreatorThenPay = async () => {
    setIsLoading(true);
    setApiError(null);
    clearError();
    try {
      console.log('[Register] handleCreateCreatorThenPay: building DTO...');
      const dto: Parameters<typeof completeRegistration>[0] = {
        role: 'representative',
        inmateNumber: state.inmateNumber,
        representativeFields: {
          creatorName: state.creatorName,
          inmateState: state.inmateState,
          relationship: state.relationship ?? '',
          consentToRecording: state.consentToRecording,
        },
        managedCreatorFields: {
          email: state.creatorEmail,
          password: state.creatorPassword,
          username: state.creatorUsername,
          displayName: state.creatorDisplayName,
          ...(state.creatorPhoneNumber && {
            phoneCountryCode: state.creatorPhoneCountryCode,
            phoneNumber: state.creatorPhoneNumber,
          }),
          ...(creatorAvatarPublicId && { avatar: creatorAvatarPublicId }),
          creatorTypes: state.creatorTypes,
          creatorGenres: state.creatorGenres,
        },
      };
      console.log('[Register] Calling completeRegistration...');
      const linkedCreatorId = await completeRegistration(dto);
      console.log('[Register] completeRegistration done, creatorId:', linkedCreatorId);
      setCreatorUserId(linkedCreatorId);
      console.log('[Register] Moving to step 13 (subscription)...');
      setCurrentStep(15);
      console.log('[Register] Step 13 set successfully');
    } catch (error: unknown) {
      console.error('[Register] handleCreateCreatorThenPay FAILED:', error);
      setApiError(getErrorMessage(error, t('errors.registrationFailed')));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreatorSetupNext = async () => {
    setIsLoading(true);
    setApiError(null);
    try {
      if (state.creatorAvatarUri) {
        try {
          const publicId = await mediaService.upload(
            state.creatorAvatarUri,
            'creator-avatar.jpg',
            'image/jpeg',
            'avatar'
          );
          setCreatorAvatarPublicId(publicId);
        } catch (uploadError: unknown) {
          console.warn(
            '[Register] Creator avatar upload failed, continuing without it:',
            uploadError
          );
          showToast(t('errors.avatarUploadSkipped'));
        }
      }
      console.log('[Register] CreatorSetupNext → goNext() to step', currentStep + 1);
      goNext();
    } finally {
      setIsLoading(false);
    }
  };

  // After payment succeeds, advance to bridge number
  const handleSubscriptionPaid = () => {
    goNext();
  };

  // Skip subscription → go straight to feed (no bridge number for free plan)
  const handleSubscriptionSkip = () => {
    useSubscriptionStore.getState().fetchSubscription();
    router.replace('/(tabs)');
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
        return <StepBasicInfo {...commonProps} onNext={goNext} />;
      case 2:
        return <StepName {...commonProps} onNext={goNext} />;
      case 3:
        return <StepDateOfBirth {...commonProps} onNext={goNext} />;
      case 4:
        return <StepCredentials {...commonProps} onNext={handleCredentialsNext} />;
      case 5:
        return <StepOtpVerification {...commonProps} onNext={handleOtpNext} />;
      case 6:
        return (
          <StepProfileSetup
            {...commonProps}
            onNext={handleProfileNext}
            showRepQuestion={showRepQuestion}
            onRepChoice={handleRepChoice}
          />
        );
      case 7:
        return <StepCreatorInmate {...commonProps} onNext={handleCreatorInmateNext} />;
      case 8:
        return <StepHowItWorks {...commonProps} onNext={goNext} />;
      case 9:
        return <StepConsentForm {...commonProps} onNext={goNext} />;
      case 10:
        return <StepCreatorBasicInfo {...commonProps} onNext={goNext} />;
      case 11:
        return <StepCreatorPassword {...commonProps} onNext={goNext} />;
      case 12:
        return <StepCreatorProfile {...commonProps} onNext={handleCreatorSetupNext} />;
      case 13:
        return <StepCreatorTypes {...commonProps} onNext={handleCreatorTypesNext} />;
      case 14:
        return <StepCreatorGenres {...commonProps} onNext={handleCreateCreatorThenPay} />;
      case 15:
        return (
          <StepSubscription
            {...commonProps}
            onNext={handleSubscriptionPaid}
            onSkip={handleSubscriptionSkip}
            forUserId={creatorUserId ?? undefined}
          />
        );
      case 16:
        return (
          <StepBridgeNumber
            {...commonProps}
            onNext={handleBridgeNumberNext}
            forUserId={creatorUserId ?? undefined}
          />
        );
      default:
        return null;
    }
  };

  const canGoBack = currentStep > 1;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        {canGoBack ? (
          <TouchableOpacity
            onPress={goBack}
            style={styles.backButton}
            activeOpacity={0.7}
          >
            <ArrowLeft size={24} color="#FFFFFF" strokeWidth={2.25} />
          </TouchableOpacity>
        ) : (
          <View style={styles.backPlaceholder} />
        )}
        {isRepFlow && (
          <View style={styles.progressBarWrapper}>
            <ProgressBar steps={REP_TOTAL} currentStep={repStep} />
          </View>
        )}
      </View>
      {renderStep()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backPlaceholder: {
    width: 40,
  },
  progressBarWrapper: {
    flex: 1,
    marginLeft: 8,
    marginRight: 48,
  },
});
