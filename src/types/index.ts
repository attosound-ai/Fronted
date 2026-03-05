/**
 * Global Types
 *
 * Tipos compartidos en toda la aplicación
 */

// Roles de usuario
export type Role = 'artist' | 'representative' | 'listener';

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
  artistName?: string;
  inmateState?: string;
  relationship?: string;
  artistEmail?: string;
  artistPhone?: string;
  consentToRecording?: boolean;
  profileVerified: boolean;
  twoFactorEnabled: boolean;
  twoFactorMethod: 'sms' | 'email' | '';
  registrationStatus: 'pending' | 'completed';
  representativeId?: number;
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
}

export interface ResetPasswordDTO {
  email: string;
  otp: string;
  password: string;
}

export interface RegisterDTO {
  username: string;
  email: string;
  password: string;
  displayName: string;
  role?: Role;
  phoneCountryCode?: string;
  phoneNumber?: string;
  inmateNumber?: string;
  representativeFields?: {
    artistName: string;
    inmateState: string;
    relationship: string;
    consentToRecording: boolean;
  };
}

// Pre-register DTO (after OTP, before Step 3)
export interface PreRegisterDTO {
  email: string;
  password: string;
  displayName: string;
  username: string;
  phoneCountryCode?: string;
  phoneNumber?: string;
}

// Complete registration DTO (Step 4 for listener, Step 8-9 for representative)
export interface CompleteRegistrationDTO {
  role: Role;
  inmateNumber?: string;
  representativeFields?: {
    artistName: string;
    inmateState: string;
    relationship: string;
    consentToRecording: boolean;
  };
}

// Update profile DTO
export interface UpdateProfileDTO {
  displayName?: string;
  avatar?: string;
  bio?: string;
  username?: string;
  // Representative fields
  artistName?: string;
  inmateNumber?: string;
  inmateState?: string;
  relationship?: string;
  artistEmail?: string;
  artistPhone?: string;
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

// Post
export interface Post {
  id: string;
  content: string;
  images: string[];
  author: Pick<User, 'id' | 'username' | 'displayName' | 'avatar'>;
  likesCount: number;
  commentsCount: number;
  isLiked: boolean;
  createdAt: string;
  updatedAt: string;
}

// Comentario
export interface Comment {
  id: string;
  content: string;
  author: Pick<User, 'id' | 'username' | 'displayName' | 'avatar'>;
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

export interface UserSubscription {
  id: string;
  plan: PlanId;
  status: 'active' | 'cancelled' | 'expired' | 'past_due';
  startsAt: string;
  expiresAt: string;
  entitlements: Entitlement[];
}

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
