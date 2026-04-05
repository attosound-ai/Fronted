import type { Role } from './index';

// Relationship between representative and creator
export type RepresentativeRelationship = 'family' | 'friend' | 'manager';

// All wizard form data accumulated across steps
export interface RegistrationWizardState {
  // Step 1: Identifier (email or phone)
  identifierMode: 'email' | 'phone';
  email: string;
  phoneCountryCode: string;
  phoneNumber: string;

  // Step 2: Name
  name: string;

  // Step 3: Credentials & Consent
  password: string;
  dateOfBirth: string;
  acceptTerms: boolean;

  // Step 3: OTP
  otpCode: string;
  otpVerified: boolean;

  // Step 4: Profile Setup
  avatarUri: string | null;
  displayName: string;
  username: string;

  // Step 5: Representative question
  isRepresentative: boolean | null;

  // Step 7: Consent Form (only if isRepresentative === true)
  relationship: RepresentativeRelationship | null;
  creatorName: string;
  inmateNumber: string;
  inmateState: string;
  consentToRecording: boolean;

  // Steps 8-10: Creator Account Setup (only if isRepresentative === true)
  creatorEmail: string;
  creatorPassword: string;
  creatorConfirmPassword: string;
  creatorUsername: string;
  creatorDisplayName: string;
  creatorPhoneCountryCode: string;
  creatorPhoneNumber: string;
  creatorAvatarUri: string | null;

  // Steps 11-12: Creator Type & Genres
  creatorTypes: string[];
  creatorGenres: string[];

  // Step 13: Subscription
  selectedPlan: 'record' | 'record_pro' | 'connect_pro' | 'none' | null;

  // Step 10: Bridge Number (assigned by backend after payment)
  bridgeNumber: string | null;
}

// Actions dispatched to the wizard reducer
export type RegistrationAction =
  | { type: 'UPDATE_FIELD'; field: keyof RegistrationWizardState; value: any }
  | { type: 'UPDATE_FIELDS'; fields: Partial<RegistrationWizardState> }
  | { type: 'RESET' };

// Shared props interface for all step components
export interface StepProps {
  state: RegistrationWizardState;
  dispatch: React.Dispatch<RegistrationAction>;
  onNext: () => void | Promise<void>;
  onBack?: () => void;
  isLoading?: boolean;
  apiError?: string | null;
}

// OTP DTOs
export interface SendOtpDTO {
  phone?: string;
  email?: string;
  locale?: string;
}

export interface VerifyOtpDTO {
  phone?: string;
  email?: string;
  code: string;
}

export interface VerifyOtpResponse {
  verified: boolean;
}

// Country code entry
export interface CountryCode {
  name: string;
  code: string;
  dial: string;
  flag: string;
}

// Subscription plan IDs
export type PlanId = 'connect_free' | 'record' | 'record_pro' | 'connect_pro';

// Subscription plan
export interface SubscriptionPlan {
  id: PlanId;
  name: string;
  price: string;
  billingPeriod: string;
  features: string[];
  entitlements: string[];
  popular?: boolean;
}

// Checkout DTO
export interface CreateCheckoutDTO {
  planId: PlanId;
  userId: number;
}

export interface CheckoutResponse {
  clientSecret: string;
  paymentIntentId: string;
}
