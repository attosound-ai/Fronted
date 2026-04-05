import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import type { ApiResponse, User } from '@/types';
import type { SendVerificationOtpDTO, VerifyCreatorOtpDTO } from '@/types/verification';

/**
 * VerificationService — Pure API calls for representative verification.
 *
 * Single Responsibility: Only handles verification HTTP requests.
 */
export const verificationService = {
  async sendVerificationOtp(data: SendVerificationOtpDTO): Promise<void> {
    await apiClient.post(API_ENDPOINTS.USERS.VERIFICATION_SEND_OTP, data);
  },

  async verifyCreatorOtp(data: VerifyCreatorOtpDTO): Promise<User> {
    const response = await apiClient.post<ApiResponse<User>>(
      API_ENDPOINTS.USERS.VERIFICATION_VERIFY,
      data
    );
    return response.data.data;
  },
};
