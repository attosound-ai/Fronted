import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallStore } from '@/stores/callStore';

/**
 * Single source of truth for "is the global green InCallTopBar occupying the
 * status-bar area right now?". The green bar (src/components/call/InCallTopBar.tsx)
 * renders IN FLOW above the navigation Stack, so when it's visible it already
 * owns the safe-area top inset — every screen header must therefore stop
 * re-reserving that inset, or you get a doubled gap under the green bar.
 *
 * Keep the predicate here and import it from BOTH InCallTopBar and the screen
 * headers so the two can never drift.
 */

/** A call counts as "in a bar-worthy state" only once it's actually up. */
export function isCallConnected(state?: string | null): boolean {
  return state === 'connected' || state === 'reconnecting';
}

/** Screens that render their OWN in-call controls, so the green bar hides there. */
const CALL_SCREEN_PATHS = ['/call', '/recording', '/(tabs)/recording'];

export function isOnCallScreen(pathname: string): boolean {
  return CALL_SCREEN_PATHS.includes(pathname);
}

/** True when the green InCallTopBar is currently shown above the Stack. */
export function useCallBarVisible(): boolean {
  const state = useCallStore((s) => s.activeCall?.state);
  const pathname = usePathname();
  return isCallConnected(state) && !isOnCallScreen(pathname);
}

/**
 * The top inset a screen header should reserve: 0 when the green bar already
 * owns the status-bar area (so headers sit flush beneath it), otherwise the real
 * safe-area top inset.
 */
export function useScreenTopInset(): number {
  const insets = useSafeAreaInsets();
  const barVisible = useCallBarVisible();
  return barVisible ? 0 : insets.top;
}
