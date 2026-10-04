import { useEffect, useRef } from 'react';
import { CommonActions, useNavigation, useRoute } from '@react-navigation/native';
import { useAccountStore } from '@/stores/accountStore';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';

/**
 * A chat belongs to the account that opened it. When the active account
 * changes (manual switch, or the cold call adopt switching to the called
 * creator) this screen is removed from the stack, wherever it sits in it.
 *
 * Without it a chat of account A stayed mounted under account B: every
 * bubble rendered as incoming (none matched B's id) and tapping a push
 * again stacked a second copy on top (client report Oct 3, "triple
 * messages", all bubbles gray on the left).
 */
export function useCloseOnAccountChange(screen: string): void {
  const navigation = useNavigation();
  const route = useRoute();
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const ownerRef = useRef(activeAccountId);

  useEffect(() => {
    if (ownerRef.current == null) {
      ownerRef.current = activeAccountId;
      return;
    }
    if (activeAccountId == null || activeAccountId === ownerRef.current) return;
    analytics.capture(ANALYTICS_EVENTS.MESSAGES.SCREEN_CLOSED_ON_ACCOUNT_CHANGE, {
      screen,
      from_account_id: ownerRef.current,
      to_account_id: activeAccountId,
    });
    const key = route.key;
    navigation.dispatch((state) => {
      const routes = state.routes.filter((r) => r.key !== key);
      if (routes.length === state.routes.length || routes.length === 0) {
        return CommonActions.navigate(state.routes[state.index].name);
      }
      return CommonActions.reset({ ...state, routes, index: routes.length - 1 } as any);
    });
  }, [activeAccountId, navigation, route.key, screen]);
}
