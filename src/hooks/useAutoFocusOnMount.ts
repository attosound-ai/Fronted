import { useEffect, type RefObject } from 'react';
import type { TextInput } from 'react-native';

/**
 * Focus a text field right after its screen or step mounts, so the keyboard
 * comes up by itself and the user can start typing.
 *
 * Why not the `autoFocus` prop: inside the signup wizard the steps swap in
 * place. The previous step's field blurs in the same frame the new one
 * mounts, and iOS resolves that race as "keyboard dismissed", so `autoFocus`
 * showed the keyboard on the first step only. A short delay lets the old
 * field finish unmounting first (the OTP field already worked this way).
 */
export function useAutoFocusOnMount(
  ref: RefObject<TextInput | null>,
  enabled = true,
  delayMs = 160
) {
  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => ref.current?.focus(), delayMs);
    return () => clearTimeout(timer);
    // Mount only: re running on every render would steal focus while typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
