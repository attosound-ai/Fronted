/**
 * Signup Service
 *
 * Thin client over the /signup/sessions/* endpoints. The server is the
 * authoritative source of truth for which step the wizard is on; the only
 * state the client persists locally is the session ID + the scoped JWT so it
 * can survive cold starts.
 */
import { apiClient } from './client';
import { API_ENDPOINTS } from './endpoints';
import type {
  SignupCompleteResult,
  SignupDraftPatch,
  SignupSessionView,
  SignupStartResult,
  SignupVerifyOtpResult,
} from '@/types';

// All responses come wrapped in the standard envelope.
interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

export interface StartSignupParams {
  identifier: string;
  identifierType: 'email' | 'phone';
  locale?: string;
  deviceId?: string;
}

export const signupService = {
  /** Create a new signup session and trigger OTP send. Public, no auth. */
  async start(params: StartSignupParams): Promise<SignupStartResult> {
    const res = await apiClient.post<ApiResponse<SignupStartResult>>(
      API_ENDPOINTS.SIGNUP.START,
      params,
    );
    return res.data.data;
  },

  /**
   * Verify the OTP for a session. On success the server issues a
   * `signup_pending` scoped JWT — store it as the active token so subsequent
   * /signup/* calls authenticate automatically.
   */
  async verifyOtp(
    sessionId: string,
    code: string,
    draft?: SignupDraftPatch,
  ): Promise<SignupVerifyOtpResult> {
    // Pass the draft (name/dob/password) atomically with the OTP code so a
    // lost response after verification doesn't leave the server verified but
    // without the user's data. Backend applies the draft BEFORE the OTP
    // roundtrip, so it persists even if the code is rejected on retry. See
    // user-service signup_service.go::VerifyOTP for the idempotency contract.
    const body =
      draft && Object.keys(draft).length > 0 ? { code, draft } : { code };
    const res = await apiClient.post<ApiResponse<SignupVerifyOtpResult>>(
      API_ENDPOINTS.SIGNUP.VERIFY_OTP(sessionId),
      body,
    );
    return res.data.data;
  },

  /** Fetch the current session bound to the signup_pending token. */
  async me(): Promise<SignupSessionView> {
    const res = await apiClient.get<ApiResponse<SignupSessionView>>(
      API_ENDPOINTS.SIGNUP.ME,
    );
    return res.data.data;
  },

  /** Merge a partial draft into the server-side session. Returns updated view. */
  async patch(draft: SignupDraftPatch): Promise<SignupSessionView> {
    const res = await apiClient.patch<ApiResponse<SignupSessionView>>(
      API_ENDPOINTS.SIGNUP.ME,
      { draft },
    );
    return res.data.data;
  },

  /**
   * Promote the session into a real users row. Returns the new full-scope
   * tokens — caller must rotate the local token immediately.
   */
  async complete(): Promise<SignupCompleteResult> {
    const res = await apiClient.post<ApiResponse<SignupCompleteResult>>(
      API_ENDPOINTS.SIGNUP.COMPLETE,
    );
    return res.data.data;
  },

  /** User explicitly exited mid-signup. Server marks session abandoned. */
  async abandon(): Promise<void> {
    await apiClient.delete(API_ENDPOINTS.SIGNUP.ABANDON);
  },
};
