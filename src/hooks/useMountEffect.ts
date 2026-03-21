import { useEffect, type EffectCallback } from 'react';

/**
 * Runs an effect exactly once when the component mounts.
 * Use instead of useEffect(..., []) to make mount-only intent explicit.
 */
export function useMountEffect(effect: EffectCallback): void {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(effect, []);
}
