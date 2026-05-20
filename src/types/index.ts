/**
 * Global Types
 *
 * Tipos compartidos en toda la aplicación
 */

// Roles de usuario
export type Role = 'creator' | 'representative' | 'listener';

// Usuario (matches backend UserProfile exactly)
export interface User {
  id: number;
  username: string;
  email: string;
  phoneCountryCode?: string | null;
  phoneNumber?: string | null;
  displayName: string;
  avatar: string | null;
  bio: string | null;
  role: Role;
  inmateNumber?: string;
  creatorName?: string;
  inmateState?: string;
  relationship?: string;
  creatorEmail?: string;
  creatorPhone?: string;
  consentToRecording?: boolean;
  creatorTypes?: string[];
  creatorGenres?: string[];
  dateOfBirth?: string | null;
  // Social media links
  socialInstagram?: string | null;
  socialTiktok?: string | null;
  socialYoutube?: string | null;
  socialSoundcloud?: string | null;
  socialSpotify?: string | null;
  socialTwitter?: string | null;
  website?: string | null;
  // Extended bio
  location?: string | null;
  recordLabel?: string | null;
  bookingEmail?: string | null;
  profileVerified: boolean;
  twoFactorEnabled: boolean;
  twoFactorMethod: 'sms' | 'email' | '';
  representativeId?: number;
  isManagedAccount?: boolean;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  isFollowing?: boolean;
  createdAt: string;
}

// Auth DTOs
export interface LoginDTO {
  identifier: string;
  password: string;
}

export interface ForgotPasswordDTO {
  email: string;
  locale?: string;
}

export interface ResetPasswordDTO {
  email: string;
  otp: string;
  password: string;
}

export interface RegisterDTO {
  username: string;
  email?: string;
  password: string;
  displayName: string;
  role?: Role;
  phoneCountryCode?: string;
  phoneNumber?: string;
  inmateNumber?: string;
  representativeFields?: {
    creatorName: string;
    inmateState: string;
    relationship: string;
    consentToRecording: boolean;
  };
}

// ── Signup-sessions API DTOs ────────────────────────────────────────────────

export type SignupNextStep =
  | 'otp'
  | 'name'
  | 'dob'
  | 'password'
  | 'profile'
  | 'role'
  | 'creator_info'
  | 'how_it_works'
  | 'consent'
  | 'subscription'
  | 'bridge_number'
  | 'complete';

export type SignupStatus = 'started' | 'verified' | 'completed' | 'abandoned';

// Mirrors the backend's publicDraft (passwords are never returned).
export interface SignupDraftView {
  displayName?: string | null;
  username?: string | null;
  dateOfBirth?: string | null;
  hasPassword: boolean;
  phoneCountryCode?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  role?: Role | null;
  avatar?: string | null;
  inmateNumber?: string | null;
  creatorName?: string | null;
  inmateState?: string | null;
  relationship?: string | null;
  consentToRecording?: boolean | null;
  selectedPlan?: string | null;
  bridgeNumber?: string | null;
  creatorEmail?: string | null;
  hasCreatorPassword: boolean;
  creatorUsername?: string | null;
  creatorDisplayName?: string | null;
  creatorPhoneCountryCode?: string | null;
  creatorPhoneNumber?: string | null;
  creatorAvatar?: string | null;
  creatorTypes?: string[];
  creatorGenres?: string[];
}

// Patch shape sent to PATCH /signup/sessions/me. Passwords go in as
// `password` / `creatorPassword` (plain) and the server hashes them.
export interface SignupDraftPatch {
  displayName?: string;
  username?: string;
  dateOfBirth?: string;
  password?: string;
  phoneCountryCode?: string;
  phoneNumber?: string;
  email?: string;
  role?: Role;
  avatar?: string;
  inmateNumber?: string;
  creatorName?: string;
  inmateState?: string;
  relationship?: string;
  consentToRecording?: boolean;
  selectedPlan?: string;
  bridgeNumber?: string;
  creatorEmail?: string;
  creatorPassword?: string;
  creatorUsername?: string;
  creatorDisplayName?: string;
  creatorPhoneCountryCode?: string;
  creatorPhoneNumber?: string;
  creatorAvatar?: string;
  creatorTypes?: string[];
  creatorGenres?: string[];
}

export interface SignupSessionView {
  id: string;
  identifier: string;
  identifierType: 'email' | 'phone';
  identifierVerified: boolean;
  status: SignupStatus;
  draft: SignupDraftView;
  completedSteps: string[];
  nextStep: SignupNextStep;
  expiresAt: string;
}

export interface SignupStartResult {
  sessionId: string;
  otpSent: boolean;
}

export interface SignupVerifyOtpResult {
  sessionId: string;
  token: string;
  expiresIn: number;
  nextStep: SignupNextStep;
  session: SignupSessionView;
}

export interface SignupCompleteResult {
  user: User;
  tokens: TokenPair;
  linkedAccount?: {
    user: User;
    tokens: TokenPair;
  };
}

// Update profile DTO
export interface UpdateProfileDTO {
  displayName?: string;
  avatar?: string;
  bio?: string;
  username?: string;
  // Representative fields
  creatorName?: string;
  inmateNumber?: string;
  inmateState?: string;
  relationship?: string;
  creatorEmail?: string;
  creatorPhone?: string;
  // Social media links + extended bio
  socialInstagram?: string;
  socialTiktok?: string;
  socialYoutube?: string;
  socialSoundcloud?: string;
  socialSpotify?: string;
  socialTwitter?: string;
  website?: string;
  location?: string;
  recordLabel?: string;
  bookingEmail?: string;
}

// Inmate lookup response from DOC scraper
export interface InmateLookupResponse {
  inmateNumber: string;
  inmateName: string;
  dateOfBirth: string;
  admissionDate: string;
  currentLocation: string;
  status: string;
  offense: string;
  sentenceDate: string;
  maxSentence: string;
  maxReleaseDate: string;
  estReleaseDate: string;
}

// Token pair from backend
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// Auth response from login/register
export interface AuthResponse {
  user: User;
  tokens: TokenPair;
}

// 2FA Types
export type TwoFactorMethod = 'sms' | 'email';

export interface Enable2FADTO {
  method: TwoFactorMethod;
}

export interface Verify2FASetupDTO {
  code: string;
  method: TwoFactorMethod;
}

export interface Disable2FADTO {
  password: string;
}

export interface Login2FADTO {
  tempToken: string;
  code: string;
}

export interface Login2FAResponse {
  requires2FA: true;
  method: TwoFactorMethod;
  tempToken: string;
  maskedTarget: string;
}

// Post (supports both legacy placeholder shape and backend FeedPostDto)
export interface Post {
  id: string;
  content: string;
  images: string[];
  author: Pick<User, 'id' | 'username' | 'displayName' | 'avatar' | 'role'>;
  likesCount: number;
  commentsCount: number;
  isLiked: boolean;
  createdAt: string;
  updatedAt: string;
  // Fields from backend FeedPostDto
  contentType?: string;
  textContent?: string;
  filePaths?: string[];
  metadata?: Record<string, string>;
  tags?: string[];
  sharesCount?: number;
  repostsCount?: number;
  isBookmarked?: boolean;
  isReposted?: boolean;
  isFollowingAuthor?: boolean;
}

// Comentario
export interface Comment {
  id: string;
  content: string;
  author: Pick<User, 'id' | 'username' | 'displayName' | 'avatar' | 'role'>;
  createdAt: string;
}

// Notificación
export interface Notification {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'mention';
  actor: Pick<User, 'id' | 'username' | 'avatar'>;
  post?: Pick<Post, 'id' | 'images'>;
  isRead: boolean;
  createdAt: string;
}

// Mensaje
export interface Message {
  id: string;
  content: string;
  senderId: number;
  receiverId: number;
  isRead: boolean;
  createdAt: string;
}

// Conversación
export interface Conversation {
  id: string;
  participant: Pick<User, 'id' | 'username' | 'displayName' | 'avatar'>;
  lastMessage: Pick<Message, 'content' | 'createdAt'>;
  unreadCount: number;
}

// Subscription entitlements
export type Entitlement =
  | 'browse_search'
  | 'listen'
  | 'comment'
  | 'record_upload'
  | 'advanced_production'
  | 'ai_avatars'
  | 'enhanced_analytics'
  | 'priority_discovery'
  | 'talent_dashboard'
  | 'exportable_reports'
  | 'early_access'
  | 'bridge_number';

export type PlanId = 'connect_free' | 'record' | 'record_pro' | 'connect_pro';

export interface PendingPlanChange {
  targetPlan: PlanId;
  appliesAt: string;
}

export interface UserSubscription {
  id: string;
  plan: PlanId;
  status: 'active' | 'cancelled' | 'expired' | 'past_due';
  startsAt: string;
  expiresAt: string;
  entitlements: Entitlement[];
  pendingChange?: PendingPlanChange | null;
}

export type PlanChangeDirection = 'upgrade' | 'downgrade' | 'same';

export interface PlanChangePreview {
  direction: PlanChangeDirection;
  currentPlan: PlanId;
  targetPlan: PlanId;
  amountDueCents: number;
  appliesAt: string;
  daysRemaining: number;
}

export type PlanChangeStartResult =
  | {
      kind: 'upgrade';
      clientSecret: string;
      paymentIntentId: string;
      amountCents: number;
      currency: string;
      targetPlan: PlanId;
    }
  | { kind: 'upgrade_free'; appliesAt: string; targetPlan: PlanId }
  | { kind: 'downgrade_scheduled'; appliesAt: string; targetPlan: PlanId };

// API Response generica
export interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}

// Paginated Response
export interface PaginatedResponse<T> {
  data: T[];
  nextCursor?: string;
  hasMore: boolean;
  total: number;
}

// Error Response
export interface ApiError {
  message: string;
  code: string;
  statusCode: number;
}
