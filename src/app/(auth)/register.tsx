import { useReducer, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

import { TouchableOpacity } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { useAuthStore } from '@/stores/authStore';
import { useSignupStore } from '@/stores/signupStore';
import { useCountryByIP } from '@/hooks/useCountryByIP';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';

import { mediaService } from '@/lib/media/mediaService';
import { showToast } from '@/components/ui/Toast';
import { ProgressBar } from '@/components/ui';
import { Text } from '@/components/ui/Text';
import type { Role, SignupDraftPatch } from '@/types';
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

const STEP_TITLE_KEYS: Record<number, string | null> = {
  1: 'registration:basicInfo.title',
  2: 'registration:name.title',
  3: 'registration:dateOfBirth.title',
  4: 'registration:credentials.title',
  5: 'registration:otp.title',
  6: null,
  7: 'registration:creatorInmate.title',
  8: 'registration:howItWorks.title',
  9: 'registration:consentForm.title',
  10: 'registration:creatorAccountSetup.title',
  11: 'registration:creatorAccountSetup.passwordTitle',
  12: 'registration:creatorAccountSetup.profileTitle',
  13: 'registration:creatorTypes.title',
  14: 'registration:creatorGenres.title',
  15: 'registration:subscription.title',
  16: 'registration:bridgeNumber.title',
};

// Step indexes that map to a server-side `nextStep` value when resuming
// from a hydrated signup session. Anything not in this map starts at step 1.
const SERVER_STEP_TO_LOCAL: Record<string, number> = {
  otp: 5,
  name: 2,
  dob: 3,
  password: 4,
  profile: 6,
  role: 6,
  creator_info: 7,
  how_it_works: 8,
  consent: 9,
  subscription: 15,
  bridge_number: 16,
};

export default function RegisterScreen() {
  const { t, i18n } = useTranslation(['common', 'registration']);
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isCreatorMode = mode === 'creator';

  // ── Signup store (server-authoritative draft + scoped JWT) ───────────────
  const hasHydrated = useSignupStore((s) => s.hasHydrated);
  const sessionId = useSignupStore((s) => s.sessionId);
  const storedNextStep = useSignupStore((s) => s.nextStep);
  const storedDraft = useSignupStore((s) => s.draft);
  const storedIdentifier = useSignupStore((s) => s.identifier);
  const storedIdentifierType = useSignupStore((s) => s.identifierType);
  const signupStart = useSignupStore((s) => s.start);
  const signupVerifyOtp = useSignupStore((s) => s.verifyOtp);
  const signupPatch = useSignupStore((s) => s.patch);
  const signupComplete = useSignupStore((s) => s.complete);
  const signupRefresh = useSignupStore((s) => s.refresh);
  const signupClear = useSignupStore((s) => s.clear);

  // ── Auth store ───────────────────────────────────────────────────────────
  const adoptCompletedSignup = useAuthStore((s) => s.adoptCompletedSignup);
  const clearError = useAuthStore((s) => s.clearError);

  // ── Local wizard state ───────────────────────────────────────────────────
  const initialStep = isCreatorMode ? 8 : 1;
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [state, dispatch] = useReducer(wizardReducer, initialWizardState);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [showRepQuestion, setShowRepQuestion] = useState(false);
  const [creatorAvatarPublicId, setCreatorAvatarPublicId] = useState<string | undefined>();
  const [creatorUserId, setCreatorUserId] = useState<number | null>(null);

  // Seed local state from the persisted signup draft after MMKV hydrates.
  // Done once, after which the reducer owns the editing state. We use a ref
  // to guarantee single execution even under StrictMode double-render.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!hasHydrated || seededRef.current) return;
    seededRef.current = true;

    // No session yet → fresh signup.
    if (!sessionId) return;

    // Translate the persisted draft back into the wizard's flat shape.
    const fields: Partial<RegistrationWizardState> = {};
    if (storedDraft?.displayName) fields.name = storedDraft.displayName;
    if (storedDraft?.username) fields.username = storedDraft.username;
    if (storedDraft?.dateOfBirth) fields.dateOfBirth = storedDraft.dateOfBirth;
    if (storedDraft?.email) fields.email = storedDraft.email;
    if (storedDraft?.phoneCountryCode) fields.phoneCountryCode = storedDraft.phoneCountryCode;
    if (storedDraft?.phoneNumber) fields.phoneNumber = storedDraft.phoneNumber;
    if (storedDraft?.inmateNumber) fields.inmateNumber = storedDraft.inmateNumber;
    if (storedDraft?.creatorName) fields.creatorName = storedDraft.creatorName;
    if (storedDraft?.inmateState) fields.inmateState = storedDraft.inmateState;
    if (storedDraft?.relationship) {
      fields.relationship = storedDraft.relationship as RegistrationWizardState['relationship'];
    }
    if (storedDraft?.consentToRecording != null) fields.consentToRecording = storedDraft.consentToRecording;
    if (storedDraft?.selectedPlan) {
      fields.selectedPlan = storedDraft.selectedPlan as RegistrationWizardState['selectedPlan'];
    }
    if (storedDraft?.bridgeNumber) fields.bridgeNumber = storedDraft.bridgeNumber;
    if (storedDraft?.creatorEmail) fields.creatorEmail = storedDraft.creatorEmail;
    if (storedDraft?.creatorUsername) fields.creatorUsername = storedDraft.creatorUsername;
    if (storedDraft?.creatorDisplayName) fields.creatorDisplayName = storedDraft.creatorDisplayName;
    if (storedDraft?.creatorPhoneCountryCode) fields.creatorPhoneCountryCode = storedDraft.creatorPhoneCountryCode;
    if (storedDraft?.creatorPhoneNumber) fields.creatorPhoneNumber = storedDraft.creatorPhoneNumber;
    if (storedDraft?.creatorTypes?.length) fields.creatorTypes = storedDraft.creatorTypes;
    if (storedDraft?.creatorGenres?.length) fields.creatorGenres = storedDraft.creatorGenres;
    if (storedIdentifierType === 'phone') fields.identifierMode = 'phone';
    if (storedDraft?.role === 'representative') fields.isRepresentative = true;
    if (storedDraft?.role === 'listener' || storedDraft?.role === 'creator') {
      fields.isRepresentative = false;
    }

    if (Object.keys(fields).length > 0) {
      dispatch({ type: 'UPDATE_FIELDS', fields });
    }

    // Re-sync with the server in the background — what we persisted in MMKV
    // might be stale (e.g. user completed step 6 on another device).
    signupRefresh().catch(() => { /* errors already surfaced via store.error */ });

    // Place the user on whichever step the server says they're on.
    if (storedNextStep && SERVER_STEP_TO_LOCAL[storedNextStep] !== undefined) {
      setCurrentStep(SERVER_STEP_TO_LOCAL[storedNextStep]);
    }
  }, [hasHydrated, sessionId, storedDraft, storedNextStep, storedIdentifier, storedIdentifierType, signupRefresh]);

  useEffect(() => {
    setApiError(null);
  }, [currentStep]);

  const { dial: detectedDial } = useCountryByIP();
  useEffect(() => {
    if (detectedDial && !storedDraft?.phoneCountryCode) {
      dispatch({ type: 'UPDATE_FIELD', field: 'phoneCountryCode', value: detectedDial });
    }
  }, [detectedDial, storedDraft?.phoneCountryCode]);

  const REP_START = 8;
  const REP_END = 16;
  const REP_TOTAL = REP_END - REP_START + 1;
  const isRepFlow = currentStep >= REP_START && currentStep <= REP_END;
  const repStep = isRepFlow ? currentStep - REP_START + 1 : 0;

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
      if (s === 7) return 6;
      if (s === 8) return 6;
      if (s === 15) {
        const grouped = getGenresForSelectedTypes(state.creatorTypes);
        return grouped.length === 0 ? 13 : 14;
      }
      return Math.max(1, s - 1);
    });
  };

  // ── Promotion to user: complete signup + adopt session ───────────────────
  // Used by all three "finish" paths (listener, creator, representative).
  const promoteToUser = useCallback(async () => {
    const result = await signupComplete();
    await adoptCompletedSignup(result.user, result.tokens, result.linkedAccount);
    signupClear();
    if (result.linkedAccount?.user?.id) {
      setCreatorUserId(result.linkedAccount.user.id);
    }
    return result;
  }, [signupComplete, adoptCompletedSignup, signupClear]);

  // ── Step 4 → Start signup session (server sends OTP) ─────────────────────
  const handleCredentialsNext = async () => {
    setIsLoading(true);
    setApiError(null);
    try {
      const identifier =
        state.identifierMode === 'phone'
          ? `${state.phoneCountryCode}${state.phoneNumber}`
          : state.email;
      const identifierType = state.identifierMode === 'phone' ? 'phone' : 'email';
      await signupStart({
        identifier,
        identifierType,
        locale: i18n.language,
      });
      analytics.capture(ANALYTICS_EVENTS.REGISTRATION.STARTED);
      analytics.capture(ANALYTICS_EVENTS.REGISTRATION.OTP_SENT);
      goNext();
    } catch (error: unknown) {
      setApiError(getErrorMessage(error, t('errors.sendOtpFailed')));
    } finally {
      setIsLoading(false);
    }
  };

  // ── Step 5 → Verify OTP with name/dob/password embedded ──────────────────
  //
  // Why bundle the draft into the verify-otp call (instead of a separate
  // patch *after* verification, as we used to):
  //
  // The OTP verify is destructive on the server (the code is single-use).
  // If the request succeeded server-side but the response was lost mid-flight
  // (network blip, app backgrounded, etc.), the previous flow left the server
  // verified with NO name/password — and the client couldn't safely retry the
  // verify (the code was burned) nor patch (no signup_pending token saved
  // locally). The user ended up stuck at the Complete step with "missing
  // required fields" and had to delete the account.
  //
  // New contract: pass the draft alongside the code. Backend applies the
  // draft BEFORE the OTP roundtrip, so on retry (with a fresh resend code)
  // the data is already on the server. Combined with the backend's
  // idempotent re-verify (`session.status == verified` → re-issue token,
  // skip OTP), the wizard is now recoverable end-to-end.
  const handleOtpNext = async () => {
    setIsLoading(true);
    setApiError(null);
    try {
      // If we already hold a signup_pending token, the session is verified —
      // just advance. Server has the data; nothing else to do here.
      const existingToken = useSignupStore.getState().token;
      if (existingToken) {
        dispatch({ type: 'UPDATE_FIELD', field: 'otpVerified', value: true });
        goNext();
        return;
      }

      const draft: SignupDraftPatch = {};
      if (state.name) draft.displayName = state.name;
      if (state.dateOfBirth) draft.dateOfBirth = state.dateOfBirth;
      if (state.password) draft.password = state.password;

      await signupVerifyOtp(state.otpCode, draft);
      dispatch({ type: 'UPDATE_FIELD', field: 'otpVerified', value: true });
      analytics.capture(ANALYTICS_EVENTS.REGISTRATION.OTP_VERIFIED);

      goNext();
    } catch (error: unknown) {
      setApiError(getErrorMessage(error, t('errors.verificationFailed')));
    } finally {
      setIsLoading(false);
    }
  };

  // ── Step 6 → Upload avatar, persist username, ask role ───────────────────
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
          console.warn('[Register] Avatar upload failed, continuing without it:', uploadError);
          showToast(t('errors.avatarUploadSkipped'));
        }
      }

      await signupPatch({
        username: state.username,
        ...(avatarPublicId && { avatar: avatarPublicId }),
      });
      analytics.capture(ANALYTICS_EVENTS.REGISTRATION.PROFILE_SETUP);
      setShowRepQuestion(true);
    } catch (error: unknown) {
      // Username conflict shows the specific message; others fall back.
      const msg = getErrorMessage(error, t('errors.profileUpdateFailed'));
      if (msg.toLowerCase().includes('username')) {
        setApiError(t('errors.usernameTaken', { defaultValue: 'Username already taken' }));
      } else {
        setApiError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ── Rep question modal → branch based on role choice ─────────────────────
  const handleRepChoice = async (choice: 'representative' | 'creator' | 'listener') => {
    dispatch({
      type: 'UPDATE_FIELD',
      field: 'isRepresentative',
      value: choice === 'representative',
    });
    setShowRepQuestion(false);
    analytics.capture(ANALYTICS_EVENTS.REGISTRATION.ROLE_SELECTED, { role: choice });
    try {
      if (choice === 'listener') {
        // Listeners finish here — patch role + complete + adopt.
        setIsLoading(true);
        await signupPatch({ role: 'listener' });
        await promoteToUser();
        router.replace('/(tabs)');
        return;
      }
      // Creator / representative: just record the role, then advance the wizard.
      await signupPatch({ role: choice });
      if (choice === 'representative') setCurrentStep(8);
      else setCurrentStep(7);
    } catch (error: unknown) {
      setApiError(getErrorMessage(error, t('errors.registrationFailed')));
    } finally {
      setIsLoading(false);
    }
  };

  // ── Step 7 → Creator confirms inmate number, then finalize as creator ────
  const handleCreatorInmateNext = async () => {
    setIsLoading(true);
    setApiError(null);
    try {
      await signupPatch({ inmateNumber: state.inmateNumber });
      await promoteToUser();
      setCurrentStep(15);
    } catch (error: unknown) {
      setApiError(getErrorMessage(error, t('errors.registrationFailed')));
    } finally {
      setIsLoading(false);
    }
  };

  // ── Step 9 → Consent saved server-side ───────────────────────────────────
  const handleConsentNext = async () => {
    setIsLoading(true);
    setApiError(null);
    try {
      await signupPatch({
        inmateNumber: state.inmateNumber,
        creatorName: state.creatorName,
        inmateState: state.inmateState,
        relationship: state.relationship ?? undefined,
        consentToRecording: state.consentToRecording,
      });
      goNext();
    } catch (error: unknown) {
      setApiError(getErrorMessage(error, t('errors.profileUpdateFailed')));
    } finally {
      setIsLoading(false);
    }
  };

  // ── Step 10 → Creator basic info patched ─────────────────────────────────
  const handleCreatorBasicInfoNext = async () => {
    setIsLoading(true);
    setApiError(null);
    try {
      await signupPatch({
        creatorEmail: state.creatorEmail,
        creatorDisplayName: state.creatorDisplayName,
        ...(state.creatorPhoneNumber && {
          creatorPhoneCountryCode: state.creatorPhoneCountryCode,
          creatorPhoneNumber: state.creatorPhoneNumber,
        }),
      });
      goNext();
    } catch (error: unknown) {
      setApiError(getErrorMessage(error, t('errors.profileUpdateFailed')));
    } finally {
      setIsLoading(false);
    }
  };

  // ── Step 11 → Creator password patched ───────────────────────────────────
  const handleCreatorPasswordNext = async () => {
    setIsLoading(true);
    setApiError(null);
    try {
      await signupPatch({ creatorPassword: state.creatorPassword });
      goNext();
    } catch (error: unknown) {
      setApiError(getErrorMessage(error, t('errors.profileUpdateFailed')));
    } finally {
      setIsLoading(false);
    }
  };

  // ── Step 12 → Creator profile (upload avatar, username, etc.) ────────────
  const handleCreatorProfileNext = async () => {
    setIsLoading(true);
    setApiError(null);
    try {
      let avatarPublicId: string | undefined;
      if (state.creatorAvatarUri) {
        try {
          avatarPublicId = await mediaService.upload(
            state.creatorAvatarUri,
            'creator-avatar.jpg',
            'image/jpeg',
            'avatar'
          );
          setCreatorAvatarPublicId(avatarPublicId);
        } catch (uploadError: unknown) {
          console.warn('[Register] Creator avatar upload failed:', uploadError);
          showToast(t('errors.avatarUploadSkipped'));
        }
      }
      await signupPatch({
        creatorUsername: state.creatorUsername,
        ...(avatarPublicId && { creatorAvatar: avatarPublicId }),
      });
      goNext();
    } catch (error: unknown) {
      setApiError(getErrorMessage(error, t('errors.profileUpdateFailed')));
    } finally {
      setIsLoading(false);
    }
  };

  // ── Step 13 → Creator types patched. If no genres apply, skip to complete.
  const handleCreatorTypesNext = async () => {
    setIsLoading(true);
    setApiError(null);
    try {
      await signupPatch({ creatorTypes: state.creatorTypes });
      const grouped = getGenresForSelectedTypes(state.creatorTypes);
      if (grouped.length === 0) {
        await handleCreateCreatorThenPay();
      } else {
        goNext();
      }
    } catch (error: unknown) {
      setApiError(getErrorMessage(error, t('errors.profileUpdateFailed')));
    } finally {
      setIsLoading(false);
    }
  };

  // ── Step 14 → Final patch for rep, then promote and continue to subscription
  const handleCreateCreatorThenPay = async () => {
    setIsLoading(true);
    setApiError(null);
    clearError();
    try {
      await signupPatch({
        creatorGenres: state.creatorGenres,
        // re-send the role to be defensive (we already patched it on rep-choice)
        role: 'representative',
      });
      const result = await promoteToUser();
      if (result.linkedAccount?.user?.id) {
        setCreatorUserId(result.linkedAccount.user.id);
      }
      setCurrentStep(15);
    } catch (error: unknown) {
      setApiError(getErrorMessage(error, t('errors.registrationFailed')));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubscriptionPaid = () => goNext();

  const handleSubscriptionSkip = () => {
    useSubscriptionStore.getState().fetchSubscription();
    router.replace('/(tabs)');
  };

  const handleBridgeNumberNext = () => {
    useSubscriptionStore.getState().fetchSubscription();
    router.replace('/(tabs)');
  };

  // ── Step renderer (component interface unchanged) ────────────────────────
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
        return <StepConsentForm {...commonProps} onNext={handleConsentNext} />;
      case 10:
        return <StepCreatorBasicInfo {...commonProps} onNext={handleCreatorBasicInfoNext} />;
      case 11:
        return <StepCreatorPassword {...commonProps} onNext={handleCreatorPasswordNext} />;
      case 12:
        return <StepCreatorProfile {...commonProps} onNext={handleCreatorProfileNext} />;
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

  const handleBackPress = () => {
    if (currentStep > 1) {
      goBack();
    } else {
      router.back();
    }
  };

  // Don't render the wizard until MMKV has hydrated — otherwise the first
  // paint may show step 1 while the persisted session is loading, and we'd
  // flash content the user shouldn't see.
  if (!hasHydrated) {
    return <View style={styles.container} />;
  }

  // Compute step title (memoised so renders stay cheap during typing).
  const titleKey = useMemo(() => STEP_TITLE_KEYS[currentStep], [currentStep]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={handleBackPress}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <ArrowLeft size={24} color="#FFFFFF" strokeWidth={2.25} />
        </TouchableOpacity>
        {isRepFlow ? (
          <View style={styles.progressBarWrapper}>
            <ProgressBar steps={REP_TOTAL} currentStep={repStep} />
          </View>
        ) : (
          titleKey && (
            <Text
              variant="h2"
              style={styles.topBarTitle}
              numberOfLines={1}
              maxFontSizeMultiplier={1.1}
            >
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {t(titleKey as any)}
            </Text>
          )
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
  progressBarWrapper: {
    flex: 1,
    marginLeft: 8,
    marginRight: 48,
  },
  topBarTitle: {
    flex: 1,
    color: '#FFFFFF',
    marginLeft: 8,
  },
});
