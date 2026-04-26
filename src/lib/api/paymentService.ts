import { apiClient } from './client';
import { API_ENDPOINTS } from './endpoints';
import type {
  ApiResponse,
  PlanChangePreview,
  PlanChangeStartResult,
  UserSubscription,
} from '@/types';
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

  async getBridgeNumber(forUserId?: number): Promise<BridgeNumberResult> {
    const response = await apiClient.get<ApiResponse<BridgeNumberResult>>(
      API_ENDPOINTS.PAYMENTS.BRIDGE_NUMBER,
      { params: forUserId ? { for_user_id: forUserId } : undefined }
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

  async previewPlanChange(targetPlan: PlanId): Promise<PlanChangePreview> {
    const response = await apiClient.get<ApiResponse<PlanChangePreview>>(
      API_ENDPOINTS.PAYMENTS.CHANGE_PLAN_PREVIEW,
      { params: { target_plan: targetPlan } }
    );
    return response.data.data;
  },

  async startPlanChange(targetPlan: PlanId, email: string): Promise<PlanChangeStartResult> {
    const response = await apiClient.post<ApiResponse<PlanChangeStartResult>>(
      API_ENDPOINTS.PAYMENTS.CHANGE_PLAN,
      { targetPlan, email }
    );
    return response.data.data;
  },

  async confirmPlanChange(targetPlan: PlanId, paymentIntentId: string): Promise<void> {
    await apiClient.post(
      API_ENDPOINTS.PAYMENTS.CHANGE_PLAN_CONFIRM,
      { targetPlan, email: '' },
      { params: { payment_intent_id: paymentIntentId } }
    );
  },

  async cancelPendingChange(): Promise<void> {
    await apiClient.delete(API_ENDPOINTS.PAYMENTS.PENDING_CHANGE);
  },
};
