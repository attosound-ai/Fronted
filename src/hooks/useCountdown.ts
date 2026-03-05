import { useState, useEffect, useRef, useCallback } from 'react';

interface UseCountdownReturn {
  remaining: number;
  isActive: boolean;
  start: (seconds: number) => void;
  reset: () => void;
}

/**
 * useCountdown — Generic countdown timer hook.
 *
 * Single Responsibility: Only manages a decrementing counter.
 * Knows nothing about OTP, resend, or any specific use case.
 */
export function useCountdown(): UseCountdownReturn {
  const [remaining, setRemaining] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback(
    (seconds: number) => {
      clear();
      setRemaining(seconds);
      intervalRef.current = setInterval(() => {
        setRemaining((prev) => {
          if (prev <= 1) {
            clear();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    },
    [clear]
  );

  const reset = useCallback(() => {
    clear();
    setRemaining(0);
  }, [clear]);

  useEffect(() => clear, [clear]);

  return { remaining, isActive: remaining > 0, start, reset };
}
