import axios from 'axios';
import { apiClient } from './client';
import { API_ENDPOINTS } from './endpoints';
import { API_CONFIG } from '@/constants/config';
import type {
  ApiResponse,
  AuthResponse,
  CompleteRegistrationDTO,
  CompleteRegistrationResponse,
  Disable2FADTO,
  Enable2FADTO,
  ForgotPasswordDTO,
  InmateLookupResponse,
  Login2FADTO,
  Login2FAResponse,
  LoginDTO,
  PreRegisterDTO,
  RegisterDTO,
  ResetPasswordDTO,
  TokenPair,
  UpdateProfileDTO,
  User,
  Verify2FASetupDTO,
} from '@/types';
import type { SendOtpDTO, VerifyOtpDTO, VerifyOtpResponse } from '@/types/registration';

/**
 * Dedicated axios instance for token refresh.
 * Uses no interceptors to avoid infinite 401 → refresh → 401 loops.
 */
const refreshClient = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: API_CONFIG.TIMEOUT,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * AuthService — Pure API calls for authentication.
 *
 * Single Responsibility: Only handles auth HTTP requests.
 * Does NOT manage state or storage — that is the store's job.
 */
export const authService = {
  async login(credentials: LoginDTO): Promise<AuthResponse | Login2FAResponse> {
    const response = await apiClient.post<ApiResponse<AuthResponse | Login2FAResponse>>(
      API_ENDPOINTS.AUTH.LOGIN,
      credentials
    );
    return response.data.data;
  },

  async register(data: RegisterDTO): Promise<AuthResponse> {
    const response = await apiClient.post<ApiResponse<AuthResponse>>(
      API_ENDPOINTS.AUTH.REGISTER,
      data
    );
    return response.data.data;
  },

  async logout(): Promise<void> {
    await apiClient.post(API_ENDPOINTS.AUTH.LOGOUT);
  },

  async refreshToken(refreshToken: string): Promise<TokenPair> {
    const response = await refreshClient.post<ApiResponse<TokenPair>>(
      API_ENDPOINTS.AUTH.REFRESH,
      { refreshToken }
    );
    return response.data.data;
  },

  async getMe(): Promise<User> {
    const response = await apiClient.get<ApiResponse<User>>(API_ENDPOINTS.AUTH.ME);
    return response.data.data;
  },

  async preRegister(data: PreRegisterDTO): Promise<AuthResponse> {
    const response = await apiClient.post<ApiResponse<AuthResponse>>(
      API_ENDPOINTS.AUTH.PRE_REGISTER,
      data
    );
    return response.data.data;
  },

  async completeRegistration(
    data: CompleteRegistrationDTO
  ): Promise<CompleteRegistrationResponse> {
    const response = await apiClient.post<ApiResponse<CompleteRegistrationResponse>>(
      API_ENDPOINTS.AUTH.COMPLETE_REGISTRATION,
      data
    );
    return response.data.data;
  },

  async switchAccount(targetUserId: number): Promise<AuthResponse> {
    const response = await apiClient.post<ApiResponse<AuthResponse>>(
      API_ENDPOINTS.AUTH.SWITCH_ACCOUNT,
      { targetUserId }
    );
    return response.data.data;
  },

  async getLinkedAccounts(): Promise<User[]> {
    const response = await apiClient.get<ApiResponse<{ accounts: User[] }>>(
      API_ENDPOINTS.USERS.LINKED_ACCOUNTS
    );
    return response.data.data.accounts;
  },

  async updateProfile(data: UpdateProfileDTO): Promise<User> {
    const response = await apiClient.patch<ApiResponse<User>>(
      API_ENDPOINTS.USERS.UPDATE_PROFILE,
      data
    );
    return response.data.data;
  },

  async checkPhone(phone: string): Promise<void> {
    await apiClient.get(API_ENDPOINTS.AUTH.CHECK_PHONE, { params: { phone } });
  },

  async checkUsername(username: string): Promise<boolean> {
    try {
      await apiClient.get(API_ENDPOINTS.AUTH.CHECK_USERNAME, { params: { username } });
      return true;
    } catch {
      return false;
    }
  },

  async checkEmail(email: string): Promise<boolean> {
    try {
      await apiClient.get(API_ENDPOINTS.AUTH.CHECK_EMAIL, { params: { email } });
      return true;
    } catch {
      return false;
    }
  },

  async sendOtp(data: SendOtpDTO): Promise<void> {
    await apiClient.post(API_ENDPOINTS.OTP.SEND, data);
  },

  async verifyOtp(data: VerifyOtpDTO): Promise<VerifyOtpResponse> {
    const response = await apiClient.post<ApiResponse<VerifyOtpResponse>>(
      API_ENDPOINTS.OTP.VERIFY,
      data
    );
    return response.data.data;
  },

  async forgotPassword(data: ForgotPasswordDTO): Promise<void> {
    await apiClient.post(API_ENDPOINTS.AUTH.FORGOT_PASSWORD, data);
  },

  async resetPassword(data: ResetPasswordDTO): Promise<void> {
    await apiClient.post(API_ENDPOINTS.AUTH.RESET_PASSWORD, data);
  },

  async lookupInmate(state: string, number: string): Promise<InmateLookupResponse> {
    const response = await apiClient.get<ApiResponse<InmateLookupResponse>>(
      API_ENDPOINTS.INMATES.LOOKUP,
      { params: { state, number } }
    );
    return response.data.data;
  },

  async login2FA(data: Login2FADTO): Promise<AuthResponse> {
    const response = await apiClient.post<ApiResponse<AuthResponse>>(
      API_ENDPOINTS.AUTH.LOGIN_2FA,
      data
    );
    return response.data.data;
  },

  async enable2FA(data: Enable2FADTO): Promise<{ maskedTarget: string }> {
    const response = await apiClient.post<ApiResponse<{ maskedTarget: string }>>(
      API_ENDPOINTS.AUTH.ENABLE_2FA,
      data
    );
    return response.data.data;
  },

  async confirm2FA(data: Verify2FASetupDTO): Promise<void> {
    await apiClient.post(API_ENDPOINTS.AUTH.CONFIRM_2FA, data);
  },

  async disable2FA(data: Disable2FADTO): Promise<void> {
    await apiClient.post(API_ENDPOINTS.AUTH.DISABLE_2FA, data);
  },
};
