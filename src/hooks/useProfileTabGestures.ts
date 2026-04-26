import { useRef, useState, useCallback } from 'react';
import { useAccountStore } from '@/stores/accountStore';
import { useAuthStore } from '@/stores/authStore';
import { haptic } from '@/lib/haptics/hapticService';

/**
 * Shared gesture logic for the profile tab button — used by both the iPhone
 * bottom tab bar (`ProfileTabButton`) and the iPad sidebar (`SidebarTabBar`).
 *
 * Behavior:
 * - Single tap: invokes `onSingleTap` (navigates to profile)
 * - Double tap (< 400ms): switches to the previous/other account
 * - Long press (500ms): opens the account switcher bottom sheet
 */
export function useProfileTabGestures(onSingleTap: () => void) {
  const [switcherVisible, setSwitcherVisible] = useState(false);

  const accounts = useAccountStore((s) => s.accounts);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const previousAccountId = useAccountStore((s) => s.previousAccountId);
  const switchToAccount = useAccountStore((s) => s.switchToAccount);
  const currentUserId = useAuthStore((s) => s.user?.id) ?? null;

  // activeAccountId can be null if user never switched before — fall back to authStore
  const effectiveActiveId = activeAccountId ?? currentUserId;

  const lastTapRef = useRef(0);
  const switchingRef = useRef(false);

  const handlePress = useCallback(() => {
    const now = Date.now();
    const delta = now - lastTapRef.current;
    lastTapRef.current = now;

    // Double-tap: switch to the other account
    if (delta < 400 && accounts.length > 1 && !switchingRef.current) {
      const targetId =
        previousAccountId ?? accounts.find((a) => a.user.id !== effectiveActiveId)?.user.id;

      if (targetId) {
        switchingRef.current = true;
        haptic('light');
        switchToAccount(targetId).finally(() => {
          switchingRef.current = false;
        });
        return;
      }
    }

    // Single tap: navigate to profile
    onSingleTap();
  }, [accounts, previousAccountId, effectiveActiveId, switchToAccount, onSingleTap]);

  const handleLongPress = useCallback(() => {
    haptic('light');
    setSwitcherVisible(true);
  }, []);

  const closeSwitcher = useCallback(() => setSwitcherVisible(false), []);

  return {
    handlePress,
    handleLongPress,
    switcherVisible,
    closeSwitcher,
  };
}
