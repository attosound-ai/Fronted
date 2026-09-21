import { useReducer, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Alert, BackHandler, StyleSheet, View, TouchableOpacity } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

import { ArrowLeft, X } from 'lucide-react-native';
import { useAuthStore } from '@/stores/authStore';
import { useSignupStore } from '@/stores/signupStore';
import { authStorage } from '@/lib/auth/storage';
import { useCountryByIP } from '@/hooks/useCountryByIP';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';

import { mediaService } from '@/lib/media/mediaService';
import { paymentService } from '@/lib/api/paymentService';
import { showToast } from '@/components/ui/Toast';
import { ProgressBar } from '@/components/ui';
import { Text } from '@/components/ui/Text';
import type { Role, SignupDraftPatch } from '@/types';
import type { RegistrationWizardState, RegistrationAction } from '@/types/registration';

import {
  AccountTypeSheet,
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
import { COLORS } from '@/constants/theme';

const initialWizardState: RegistrationWizardState = {
  accountType: null,
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
  const { mode, role: roleParam } = useLocalSearchParams<{
    mode?: string;
    role?: string;
  }>();
  const isCreatorMode = mode === 'creator';

  // The account type chosen in the Welcome sheet arrives as a route param.
  // `mode=creator` (adding a managed creator from an existing account) is a
  // representative flow by definition, so it needs no sheet.
  const paramRole: Role | null = isCreatorMode
    ? 'representative'
    : roleParam === 'creator' ||
        roleParam === 'representative' ||
        roleParam === 'listener'
      ? roleParam
      : null;

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
  const signupAbandon = useSignupStore((s) => s.abandon);

  // ── Auth store ───────────────────────────────────────────────────────────
  const adoptCompletedSignup = useAuthStore((s) => s.adoptCompletedSignup);
  const clearError = useAuthStore((s) => s.clearError);

  // ── Local wizard state ───────────────────────────────────────────────────
  const initialStep = isCreatorMode ? 8 : 1;
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [state, dispatch] = useReducer(
    wizardReducer,
    initialWizardState,
    (init): RegistrationWizardState => ({
      ...init,
      accountType: paramRole,
      isRepresentative: paramRole ? paramRole === 'representative' : null,
    })
  );
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  // Set when the user dismisses the fallback sheet inside the wizard without picking.
  const [roleSheetDismissed, setRoleSheetDismissed] = useState(false);

  // Does signup still need the subscription screen? The admin dashboard
  // decides which features each plan grants; when the free plan grants
  // everything there is nothing to sell and the screen is skipped. Defaults
  // to true so a failed fetch can never skip a payment by accident.
  const [paywallRequired, setPaywallRequired] = useState(true);
  useEffect(() => {
    let cancelled = false;
    paymentService
      .getPaywall()
      .then((cfg) => {
        if (!cancelled) setPaywallRequired(cfg.required);
      })
      .catch(() => {
        // Keep the safe default.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Where a creator branch lands once the account exists and nothing is left
  // to sell. The subscription screen is skipped, the bridge number is not:
  // a free plan that grants everything grants the number too, and with no
  // payment to trigger it the number step is what claims it. Skipping both
  // left new creators without a number and without ever seeing the screen.
  const [claimBridgeNumber, setClaimBridgeNumber] = useState(false);
  const finishWithoutPaywall = () => {
    useSubscriptionStore.getState().fetchSubscription();
    setClaimBridgeNumber(true);
    setCurrentStep(16);
  };
  // A resumed signup can land on the subscription step before the paywall
  // answer arrives. With nothing to sell, move on to the number.
  useEffect(() => {
    if (currentStep === 15 && !paywallRequired) finishWithoutPaywall();
  }, [currentStep, paywallRequired]);
  const [creatorAvatarPublicId, setCreatorAvatarPublicId] = useState<
    string | undefined
  >();
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
    if (storedDraft?.phoneCountryCode)
      fields.phoneCountryCode = storedDraft.phoneCountryCode;
    if (storedDraft?.phoneNumber) fields.phoneNumber = storedDraft.phoneNumber;
    if (storedDraft?.inmateNumber) fields.inmateNumber = storedDraft.inmateNumber;
    if (storedDraft?.creatorName) fields.creatorName = storedDraft.creatorName;
    if (storedDraft?.inmateState) fields.inmateState = storedDraft.inmateState;
    if (storedDraft?.relationship) {
      fields.relationship =
        storedDraft.relationship as RegistrationWizardState['relationship'];
    }
    if (storedDraft?.consentToRecording != null)
      fields.consentToRecording = storedDraft.consentToRecording;
    if (storedDraft?.selectedPlan) {
      fields.selectedPlan =
        storedDraft.selectedPlan as RegistrationWizardState['selectedPlan'];
    }
    if (storedDraft?.bridgeNumber) fields.bridgeNumber = storedDraft.bridgeNumber;
    if (storedDraft?.creatorEmail) fields.creatorEmail = storedDraft.creatorEmail;
    if (storedDraft?.creatorUsername)
      fields.creatorUsername = storedDraft.creatorUsername;
    if (storedDraft?.creatorDisplayName)
      fields.creatorDisplayName = storedDraft.creatorDisplayName;
    if (storedDraft?.creatorPhoneCountryCode)
      fields.creatorPhoneCountryCode = storedDraft.creatorPhoneCountryCode;
    if (storedDraft?.creatorPhoneNumber)
      fields.creatorPhoneNumber = storedDraft.creatorPhoneNumber;
    if (storedDraft?.creatorTypes?.length) fields.creatorTypes = storedDraft.creatorTypes;
    if (storedDraft?.creatorGenres?.length)
      fields.creatorGenres = storedDraft.creatorGenres;
    if (storedIdentifierType === 'phone') fields.identifierMode = 'phone';
    if (storedDraft?.role === 'representative') {
      fields.accountType = 'representative';
      fields.isRepresentative = true;
    }
    if (storedDraft?.role === 'listener' || storedDraft?.role === 'creator') {
      fields.accountType = storedDraft.role;
      fields.isRepresentative = false;
    }

    if (Object.keys(fields).length > 0) {
      dispatch({ type: 'UPDATE_FIELDS', fields });
    }

    // Recover the in-progress plaintext password from SecureStore. The
    // server's draft only exposes `hasPassword: boolean` (the hash never
    // round-trips to the client), so without this rehydration the wizard
    // would resume with state.password === '' after a cold start, and
    // verify-otp would send a draft with no password — leading to the
    // "missing required fields" Complete failure that this fix addresses.
    if (!storedDraft?.hasPassword) {
      void authStorage.getSignupPassword().then((pw) => {
        if (pw) dispatch({ type: 'UPDATE_FIELD', field: 'password', value: pw });
      });
    }

    // Re-sync with the server in the background — what we persisted in MMKV
    // might be stale (e.g. user completed step 6 on another device).
    signupRefresh().catch(() => {
      /* errors already surfaced via store.error */
    });

    // Place the user on whichever step the server says they're on.
    if (storedNextStep === 'creator_info' && storedDraft?.role === 'representative') {
      // The server only knows "inmate number missing". A representative
      // collects it on the consent form after the intro, never on the
      // creator's own identity step.
      setCurrentStep(8);
    } else if (storedNextStep && SERVER_STEP_TO_LOCAL[storedNextStep] !== undefined) {
      setCurrentStep(SERVER_STEP_TO_LOCAL[storedNextStep]);
    } else if (
      storedNextStep === 'complete' &&
      (storedDraft?.role === 'creator' || storedDraft?.role === 'listener')
    ) {
      // NextStepFor only tracks the representative branch past the role, so an
      // own account comes back as 'complete' while the client still owes the
      // optional artist check (and, for a creator, the subscription).
      setCurrentStep(storedDraft?.inmateNumber ? 15 : 7);
    }
  }, [
    hasHydrated,
    sessionId,
    storedDraft,
    storedNextStep,
    storedIdentifier,
    storedIdentifierType,
    signupRefresh,
  ]);

  useEffect(() => {
    setApiError(null);
  }, [currentStep]);

  // A resumed session the server no longer has (abandoned elsewhere, expired,
  // or cancelled from another device): the background refresh clears the
  // store, and the wizard must not sit on a step that belongs to nobody.
  // promoteToUser also clears the store, so that path is flagged and ignored.
  const resumedSessionRef = useRef(!!useSignupStore.getState().sessionId);
  const completedRef = useRef(false);
  useEffect(() => {
    if (resumedSessionRef.current && !sessionId && !completedRef.current) {
      resumedSessionRef.current = false;
      router.replace('/(auth)/welcome');
    }
  }, [sessionId]);

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
          leaveWizard();
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
      // The number step closes the signup: the account and its number exist,
      // and behind it sits a subscription screen that may have been skipped.
      if (s === 16) return s;
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
    completedRef.current = true;
    await adoptCompletedSignup(result.user, result.tokens, result.linkedAccount);
    signupClear();
    // Wipe the wizard-only password cache from SecureStore now that the
    // signup is durably promoted. Best-effort: failures here aren't fatal.
    void authStorage.removeSignupPassword().catch(() => {});
    if (result.linkedAccount?.user?.id) {
      setCreatorUserId(result.linkedAccount.user.id);
    }
    return result;
  }, [signupComplete, adoptCompletedSignup, signupClear]);

  // ── Profile photo upload that does not give up on the first hiccup ───────
  // Sep 19 2026: David's own photo was dropped because the signing request
  // timed out once (15 s) and the wizard moved on with a small toast. One
  // silent retry first; if that fails too, the user decides between trying
  // again and continuing without a photo, instead of finding out later.
  const uploadAvatarOrAsk = async (
    uri: string,
    fileName: string
  ): Promise<string | undefined> => {
    for (;;) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          return await mediaService.upload(uri, fileName, 'image/jpeg', 'avatar');
        } catch (uploadError: unknown) {
          console.warn(
            `[Register] Avatar upload attempt ${attempt + 1} failed:`,
            uploadError
          );
        }
      }
      const choice = await new Promise<'retry' | 'skip'>((resolve) => {
        Alert.alert(t('errors.avatarUploadTitle'), t('errors.avatarUploadMessage'), [
          {
            text: t('errors.avatarUploadSkip'),
            style: 'cancel',
            onPress: () => resolve('skip'),
          },
          { text: t('errors.avatarUploadRetry'), onPress: () => resolve('retry') },
        ]);
      });
      if (choice === 'skip') {
        showToast(t('errors.avatarUploadSkipped'));
        return undefined;
      }
    }
  };

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
      // Persist the raw password so it survives an app cold-restart
      // BEFORE signup completes. The server's draft response only
      // includes `hasPassword: boolean` (never the plaintext), so without
      // this the wizard would resume with state.password === '' and
      // verify-otp would ship an empty draft.password — landing us back
      // at Complete failing with "missing required fields". SecureStore
      // is hardware-backed (Keychain on iOS), and the value is wiped in
      // promoteToUser on successful completion.
      if (state.password) {
        void authStorage.setSignupPassword(state.password).catch(() => {});
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
      // The account type was picked before step 1, so ship it with the verify.
      // The server's NextStepFor then knows the branch from the first sync and
      // never sends the wizard back to a 'role' step halfway through.
      if (state.accountType) draft.role = state.accountType;

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
        avatarPublicId = await uploadAvatarOrAsk(state.avatarUri, 'avatar.jpg');
      }

      await signupPatch({
        username: state.username,
        ...(avatarPublicId && { avatar: avatarPublicId }),
      });
      analytics.capture(ANALYTICS_EVENTS.REGISTRATION.PROFILE_SETUP);
      // The role was answered in the bottom sheet before step 1. Branch on it
      // instead of interrupting the user with the old question here.
      await continueWithRole();
    } catch (error: unknown) {
      // Username conflict shows the specific message; others fall back.
      const msg = getErrorMessage(error, t('errors.profileUpdateFailed'));
      if (msg.toLowerCase().includes('username')) {
        setApiError(
          t('errors.usernameTaken', { defaultValue: 'Username already taken' })
        );
      } else {
        setApiError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ── Branch on the account type picked in the opening sheet ───────────────
  // Runs right after the profile step. Never throws: it reports its own
  // failure through `apiError` so the caller's catch only sees patch errors.
  const continueWithRole = async () => {
    const role = state.accountType;
    if (!role) {
      // Can't happen: the sheet blocks step 1 until a role exists. Ask again
      // rather than completing the signup as the wrong kind of account.
      setRoleSheetDismissed(false);
      return;
    }
    try {
      // An own account starts as a standard one and ends on the optional
      // inmate step: validating an artist there is what turns it into a
      // creator, skipping leaves it standard (David, Sep 19 2026).
      await signupPatch({
        role: role === 'representative' ? 'representative' : 'listener',
      });
      setCurrentStep(role === 'representative' ? 8 : 7);
    } catch (error: unknown) {
      setApiError(getErrorMessage(error, t('errors.registrationFailed')));
    }
  };

  // ── Account type picked in the sheet (fallback path inside the wizard) ────
  const handleAccountTypeSelect = (role: Role) => {
    dispatch({
      type: 'UPDATE_FIELDS',
      fields: { accountType: role, isRepresentative: role === 'representative' },
    });
    analytics.capture(ANALYTICS_EVENTS.REGISTRATION.ROLE_SELECTED, {
      role,
      at: 'wizard',
    });
  };

  // ── Step 7 → The optional artist check that closes an own account ────────
  // With a validated inmate the account is promoted to creator and follows the
  // creator path (paywall when the plan requires it). Skipped, it completes as
  // the standard account it already is.
  const handleCreatorInmateNext = async () => {
    setIsLoading(true);
    setApiError(null);
    try {
      await signupPatch({ role: 'creator', inmateNumber: state.inmateNumber });
      analytics.capture(ANALYTICS_EVENTS.REGISTRATION.ROLE_SELECTED, {
        role: 'creator',
        at: 'inmate_step',
      });
      await promoteToUser();
      if (!paywallRequired) {
        finishWithoutPaywall();
        return;
      }
      setCurrentStep(15);
    } catch (error: unknown) {
      setApiError(getErrorMessage(error, t('errors.registrationFailed')));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkipInmate = async () => {
    setIsLoading(true);
    setApiError(null);
    try {
      analytics.capture(ANALYTICS_EVENTS.REGISTRATION.ROLE_SELECTED, {
        role: 'listener',
        at: 'inmate_step_skipped',
      });
      await promoteToUser();
      router.replace('/(tabs)');
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
        avatarPublicId = await uploadAvatarOrAsk(
          state.creatorAvatarUri,
          'creator-avatar.jpg'
        );
        if (avatarPublicId) setCreatorAvatarPublicId(avatarPublicId);
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
      // A representative MUST come back with its managed creator. If it doesn't,
      // the server failed to create the creator — never drop the user into the
      // app with an orphaned representative (Sep 2026 incident). Surface it so
      // they can retry instead of silently continuing.
      if (!result.linkedAccount?.user?.id) {
        throw new Error('CREATOR_ACCOUNT_NOT_CREATED');
      }
      setCreatorUserId(result.linkedAccount.user.id);
      if (!paywallRequired) {
        finishWithoutPaywall();
        return;
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
        return (
          <StepBasicInfo
            {...commonProps}
            onNext={goNext}
            // No keyboard under the account type sheet.
            autoFocus={!needsAccountType}
          />
        );
      case 2:
        return <StepName {...commonProps} onNext={goNext} />;
      case 3:
        return <StepDateOfBirth {...commonProps} onNext={goNext} />;
      case 4:
        return <StepCredentials {...commonProps} onNext={handleCredentialsNext} />;
      case 5:
        return <StepOtpVerification {...commonProps} onNext={handleOtpNext} />;
      case 6:
        return <StepProfileSetup {...commonProps} onNext={handleProfileNext} />;
      case 7:
        return (
          <StepCreatorInmate
            {...commonProps}
            onNext={handleCreatorInmateNext}
            onSkip={handleSkipInmate}
          />
        );
      case 8:
        return <StepHowItWorks {...commonProps} onNext={goNext} />;
      case 9:
        return <StepConsentForm {...commonProps} onNext={handleConsentNext} />;
      case 10:
        return (
          <StepCreatorBasicInfo {...commonProps} onNext={handleCreatorBasicInfoNext} />
        );
      case 11:
        return (
          <StepCreatorPassword {...commonProps} onNext={handleCreatorPasswordNext} />
        );
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
            claimWithoutPayment={claimBridgeNumber}
          />
        );
      default:
        return null;
    }
  };

  // Leave a signup that was started earlier. The app resumes a pending
  // signup on every launch (index.tsx), so without this a half finished
  // registration held the phone hostage: the welcome screen never came back
  // and "back" on step 1 had nowhere to go.
  const handleAbandon = () => {
    Alert.alert(t('registration:abandon.title'), t('registration:abandon.message'), [
      { text: t('registration:abandon.keep'), style: 'cancel' },
      {
        text: t('registration:abandon.confirm'),
        style: 'destructive',
        onPress: async () => {
          await signupAbandon();
          void authStorage.removeSignupPassword().catch(() => {});
          router.replace('/(auth)/welcome');
        },
      },
    ]);
  };

  const leaveWizard = () => {
    if (sessionId) {
      handleAbandon();
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(auth)/welcome');
    }
  };

  const handleBackPress = () => {
    if (currentStep > 1) {
      goBack();
    } else {
      leaveWizard();
    }
  };

  // Once the account exists (subscription and bridge number steps) there is
  // nothing to abandon any more; those steps have their own skip.
  const canAbandon = !!sessionId && currentStep < 15 && !isCreatorMode;

  // Compute step title (memoised so renders stay cheap during typing).
  // Declared BEFORE the hydration guard below: a hook that sits after an
  // early return changes the hook count between renders the moment the guard
  // flips, which React rejects outright.
  const titleKey = useMemo(() => STEP_TITLE_KEYS[currentStep], [currentStep]);

  // Don't render the wizard until MMKV has hydrated — otherwise the first
  // paint may show step 1 while the persisted session is loading, and we'd
  // flash content the user shouldn't see.
  if (!hasHydrated) {
    return <View style={styles.container} />;
  }

  // Normally the role arrives as a route param from the Welcome sheet. It can
  // still be missing here: a deep link into /register, or a session started
  // before the sheet existed. Ask over step 1 rather than guessing. Derived
  // instead of an effect so the sheet never flashes while the draft seeds.
  const roleFromDraft =
    storedDraft?.role === 'creator' ||
    storedDraft?.role === 'representative' ||
    storedDraft?.role === 'listener'
      ? storedDraft.role
      : null;
  const needsAccountType =
    !isCreatorMode && !state.accountType && !roleFromDraft && !roleSheetDismissed;

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
        {canAbandon ? (
          <TouchableOpacity
            onPress={handleAbandon}
            style={styles.closeButton}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('registration:abandon.action')}
            hitSlop={8}
          >
            <X size={22} color="#FFFFFF" strokeWidth={2.25} />
          </TouchableOpacity>
        ) : null}
      </View>
      {renderStep()}

      <AccountTypeSheet
        visible={needsAccountType}
        onClose={() => setRoleSheetDismissed(true)}
        onSelect={handleAccountTypeSelect}
        onCancel={() => {
          // A resumed signup lands here through a Redirect, with no screen
          // behind it to go back to.
          if (router.canGoBack()) router.back();
          else router.replace('/(auth)/welcome');
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background.primary,
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
    marginRight: 8,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarTitle: {
    flex: 1,
    color: '#FFFFFF',
    marginLeft: 8,
  },
});
