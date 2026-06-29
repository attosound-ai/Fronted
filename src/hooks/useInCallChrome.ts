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

/**
 * Screens that render their OWN in-call controls, so the global green bar hides
 * there. Only the dedicated /call ringing screen qualifies now — the recorder
 * shows the SAME global InCallTopBar (call controls) above its back+logo nav, so
 * the in-call header is identical across the whole app.
 */
const CALL_SCREEN_PATHS = ['/call'];

export function isOnCallScreen(pathname: string): boolean {
  return CALL_SCREEN_PATHS.includes(pathname);
}

/** True when the green InCallTopBar is currently shown above the Stack. */
export function useCallBarVisible(): boolean {
  const state = useCallStore((s) => s.activeCall?.state);
  const pathname = usePathname();
  return isCallConnected(state) && !isOnCallScreen(pathname);
}

/** Height of the green call bar's controls row + a little breathing room below
 *  it, BELOW the safe-area inset (so each section's header sits clear of it). */
export const IN_CALL_BAR_HEIGHT = 66;

/**
 * The top inset a screen header should reserve. The call bar is now an OVERLAY
 * (it doesn't push content), so when it's up a header reserves room BELOW it —
 * the bar's status inset + its controls height — to sit clear of it. Otherwise
 * the real safe-area top inset.
 */
export function useScreenTopInset(): number {
  const insets = useSafeAreaInsets();
  const barVisible = useCallBarVisible();
  return barVisible ? insets.top + IN_CALL_BAR_HEIGHT : insets.top;
}
