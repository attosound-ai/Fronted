import { useRef, useState, useCallback } from 'react';
import { useAccountStore } from '@/stores/accountStore';
import { useAuthStore } from '@/stores/authStore';
import { useAccountSwitchPromptStore } from '@/stores/accountSwitchPromptStore';
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
        previousAccountId ??
        accounts.find((a) => a.user.id !== effectiveActiveId)?.user.id;

      if (targetId) {
        switchingRef.current = true;
        haptic('light');
        switchToAccount(targetId)
          .catch((err: unknown) => {
            // NEVER fail silently here. Before, this path only had `.finally()`,
            // so a switch blocked by an active call did nothing at all — no
            // feedback, no way out (Sep 8 2026 "stuck on wrong account"). Now a
            // blocked switch opens the actionable prompt (end call & switch, or
            // stay). Other errors self-rollback in switchToAccount.
            if ((err as { code?: string })?.code === 'CANNOT_SWITCH_DURING_ACTIVE_CALL') {
              const target = accounts.find((a) => Number(a.user.id) === Number(targetId));
              useAccountSwitchPromptStore.getState().request({
                targetUserId: targetId,
                targetUsername: target?.user.username ?? '',
              });
            }
          })
          .finally(() => {
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
