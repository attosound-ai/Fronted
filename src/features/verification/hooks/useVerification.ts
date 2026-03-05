import { useState, useCallback, useEffect } from 'react';
import { verificationService } from '../services/verificationService';
import { paymentService } from '@/lib/api/paymentService';
import { authService } from '@/lib/api/authService';
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
    paymentService
      .getBridgeNumber()
      .then(async (result) => {
        if (cancelled || !result.bridgeNumber) return;
        setBridgePhone(result.bridgeNumber);
        // Auto-send OTP so the code is ready for the representative
        try {
          await verificationService.sendVerificationOtp({
            bridgePhone: result.bridgeNumber,
          });
        } catch {
          // Silently fail — user can still enter code manually
        }
      })
      .catch(() => {
        // Subscription may not exist yet (e.g. skipped payment)
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
      if (code.length === 6 && bridgePhone) {
        setIsVerifying(true);
        verificationService
          .verifyArtistOtp({ bridgePhone, code })
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
    otpCode,
    otpError,
    isVerifying,
    isFetchingBridge,
    isVerified: user?.profileVerified ?? false,
    handleOtpChange,
  };
}
