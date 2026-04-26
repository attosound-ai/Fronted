import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { useAuthStore } from '@/stores/authStore';
import { useAccountStore } from '@/stores/accountStore';
import { queryClient } from '@/lib/queryClient';
import { analytics } from '@/lib/analytics';

interface DeleteAccountParams {
  otpCode: string;
  otpIdentifier: string;
  deleteLinkedAccounts: boolean;
}

export function useDeleteAccount() {
  const [otpSent, setOtpSent] = useState(false);
  const logout = useAuthStore((s) => s.logout);
  const clearAll = useAccountStore((s) => s.clearAll);

  const sendOtp = useMutation({
    mutationFn: async (identifier: string) => {
      const isEmail = identifier.includes('@');
      await apiClient.post(API_ENDPOINTS.OTP.SEND, {
        ...(isEmail ? { email: identifier } : { phone: identifier }),
        email_template: 'delete_account',
      });
    },
    onSuccess: () => setOtpSent(true),
  });

  const deleteAccount = useMutation({
    mutationFn: async (params: DeleteAccountParams) => {
      await apiClient.delete(API_ENDPOINTS.USERS.DELETE_ACCOUNT, {
        data: params,
      });
    },
    onSuccess: async () => {
      analytics.capture('account_deleted', {});
      queryClient.clear();
      await clearAll();
      await logout();
      router.replace('/(auth)/welcome');
    },
    onError: (err: unknown) => {
      const apiMessage = (err as {
        response?: { data?: { error?: string }; status?: number };
      })?.response?.data?.error;
      const status = (err as { response?: { status?: number } })?.response?.status;
      analytics.capture('account_delete_failed', {
        api_error: apiMessage ?? null,
        status_code: status ?? null,
        client_error: err instanceof Error ? err.message : null,
      });
    },
  });

  return {
    sendOtp: sendOtp.mutate,
    isSendingOtp: sendOtp.isPending,
    sendOtpError: sendOtp.error,
    otpSent,
    deleteAccount: deleteAccount.mutate,
    isDeleting: deleteAccount.isPending,
    deleteError: deleteAccount.error,
    reset: () => {
      setOtpSent(false);
      sendOtp.reset();
      deleteAccount.reset();
    },
  };
}
