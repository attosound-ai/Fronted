import { useState, useCallback, useEffect } from 'react';
import { verificationService } from '../services/verificationService';
import { paymentService } from '@/lib/api/paymentService';
import { authService } from '@/lib/api/authService';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/stores/authStore';

/**
 * useVerification — Manages the representative verification OTP flow.
 *
 * Auto-sends OTP when bridge phone is available.
 * OTP fields are always visible — no manual "send" step.
 */
export function useVerification() {
  const setUser = useAuthStore((s) => s.setUser);
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [bridgePhone, setBridgePhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isFetchingBridge, setIsFetchingBridge] = useState(true);

  // Fetch bridge phone and auto-send OTP on mount (only when authenticated)
  useEffect(() => {
    if (!isAuthenticated) {
      setIsFetchingBridge(false);
      return;
    }
    let cancelled = false;

    async function fetchBridgeNumber() {
      try {
        // Try current user first
        const result = await paymentService.getBridgeNumber();
        if (!cancelled && result.bridgeNumber) {
          return result.bridgeNumber;
        }
      } catch {
        // No subscription for current user
      }

      // If representative, find linked creator and check their bridge number
      if (user?.role === 'representative') {
        try {
          const linkedRes = await apiClient.get('/users/me/linked-accounts');
          const accounts = linkedRes.data?.data?.accounts ?? [];
          for (const account of accounts) {
            try {
              const res = await apiClient.get('/payments/bridge-number', {
                params: { for_user_id: String(account.id) },
              });
              const bridge = res.data?.data?.bridgeNumber;
              if (bridge) return bridge;
            } catch {
              // No bridge number for this linked account
            }
          }
        } catch {
          // No linked accounts
        }
      }
      return null;
    }

    fetchBridgeNumber()
      .then(async (bridge) => {
        if (cancelled || !bridge) return;
        setBridgePhone(bridge);
        try {
          await verificationService.sendVerificationOtp({ bridgePhone: bridge });
        } catch {
          // Silently fail
        }
      })
      .finally(() => {
        if (!cancelled) setIsFetchingBridge(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const handleOtpChange = useCallback(
    (code: string) => {
      setOtpCode(code);
      if (otpError) setOtpError(null);

      // Auto-submit when all 6 digits are entered
      if (code.length === 6 && !bridgePhone) {
        setOtpError(
          'Bridge number not available. Please restart the app or contact support.'
        );
        return;
      }
      if (code.length === 6 && bridgePhone) {
        setIsVerifying(true);
        verificationService
          .verifyCreatorOtp({ bridgePhone, code })
          .then(async () => {
            // Refresh user to get profileVerified=true
            const freshUser = await authService.getMe();
            setUser(freshUser);
            setOtpCode('');
            setOtpError(null);
          })
          .catch(() => {
            setOtpError("That code didn't work. Please try again.");
            setOtpCode('');
          })
          .finally(() => {
            setIsVerifying(false);
          });
      }
    },
    [bridgePhone, otpError, setUser]
  );

  return {
    bridgePhone,
    hasBridgePhone: bridgePhone !== '',
    otpCode,
    otpError,
    isVerifying,
    isFetchingBridge,
    isVerified: user?.profileVerified ?? false,
    handleOtpChange,
  };
}
