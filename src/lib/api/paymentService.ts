import { apiClient } from './client';
import { API_ENDPOINTS } from './endpoints';
import type { ApiResponse, UserSubscription } from '@/types';
import type { CheckoutResponse, PlanId, SubscriptionPlan } from '@/types/registration';

export interface BridgeNumberResult {
  bridgeNumber: string | null;
  status: 'assigned' | 'provisioning' | 'failed';
}

/**
 * PaymentService — Pure API calls for payments and subscriptions.
 *
 * Single Responsibility: Only handles payment HTTP requests.
 * Does NOT manage state or Stripe SDK — that is the component's job.
 */
export const paymentService = {
  async createCheckout(planId: string, email: string, forUserId?: string): Promise<CheckoutResponse> {
    const response = await apiClient.post<ApiResponse<CheckoutResponse>>(
      API_ENDPOINTS.PAYMENTS.CHECKOUT,
      { planId, email, ...(forUserId && { forUserId }) }
    );
    return response.data.data;
  },

  async confirmPayment(paymentIntentId: string): Promise<BridgeNumberResult> {
    const response = await apiClient.post<ApiResponse<BridgeNumberResult>>(
      API_ENDPOINTS.PAYMENTS.CONFIRM,
      { paymentIntentId }
    );
    return response.data.data;
  },

  async getBridgeNumber(): Promise<BridgeNumberResult> {
    const response = await apiClient.get<ApiResponse<BridgeNumberResult>>(
      API_ENDPOINTS.PAYMENTS.BRIDGE_NUMBER
    );
    return response.data.data;
  },

  async getMySubscription(): Promise<UserSubscription> {
    const response = await apiClient.get<ApiResponse<UserSubscription>>(
      API_ENDPOINTS.PAYMENTS.MY_SUBSCRIPTION
    );
    return response.data.data;
  },

  async cancelSubscription(): Promise<void> {
    await apiClient.delete(API_ENDPOINTS.PAYMENTS.MY_SUBSCRIPTION);
  },

  async getPlans(): Promise<SubscriptionPlan[]> {
    const response = await apiClient.get<ApiResponse<SubscriptionPlan[]>>(
      API_ENDPOINTS.PAYMENTS.PLANS
    );
    return response.data.data;
  },

  async upgradeSubscription(
    targetPlan: PlanId,
    email: string,
    forUserId?: string
  ): Promise<CheckoutResponse> {
    const response = await apiClient.post<ApiResponse<CheckoutResponse>>(
      API_ENDPOINTS.PAYMENTS.UPGRADE,
      { targetPlan, email, ...(forUserId && { forUserId }) }
    );
    return response.data.data;
  },
};
