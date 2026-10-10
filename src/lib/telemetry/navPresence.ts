import { AppState } from 'react-native';

import { analytics } from '@/lib/analytics';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { resumeContext } from './resumeProbe';

/**
 * A screen the router opened that iOS never put on screen.
 *
 * Oct 9 2026: the client tapped "+" and "New Post" eight times; every time the
 * router recorded /create-post as the current screen while the phone kept showing
 * the feed, until the app was killed. Nothing threw, so Sentry had nothing, and
 * the only trace was every later tap carrying `$screen_name: /create-post`.
 *
 * The router focusing a route is a JS fact. The screen appearing is a native
 * one: react-native-screens fires `onAppear` from the view controller's
 * viewDidAppear, which native-stack forwards as `transitionEnd` with
 * `closing: false`. A root route that is focused and still not on screen after
 * NOT_PRESENTED_AFTER_MS while the app is in the foreground is reported as
 * `nav_screen_not_presented`; if it shows up later anyway the delay is reported
 * as `nav_screen_presented_late`, so a slow transition is told apart from one
 * that never happens.
 *
 * A screen that already appeared and was never hidden (a page sheet modal over
 * it does not hide it) is not checked again when it regains focus: iOS sends no
 * second viewDidAppear in that case.
 */

const NOT_PRESENTED_AFTER_MS = 2500;

interface RouteWatch {
  name: string;
  appeared: boolean;
  focusedAt: number | null;
  reportedAt: number | null;
  timer: ReturnType<typeof setTimeout> | null;
}

const watches = new Map<string, RouteWatch>();
let notPresentedCount = 0;

interface ListenerRoute {
  key: string;
  name: string;
}

interface ListenerNavigation {
  isFocused(): boolean;
  getState(): { routes: { name: string }[] } | undefined;
}

function watchFor(route: ListenerRoute): RouteWatch {
  let w = watches.get(route.key);
  if (!w) {
    w = {
      name: route.name,
      appeared: false,
      focusedAt: null,
      reportedAt: null,
      timer: null,
    };
    watches.set(route.key, w);
  }
  return w;
}

function clearTimer(w: RouteWatch): void {
  if (w.timer) clearTimeout(w.timer);
  w.timer = null;
}

function stackNames(navigation: ListenerNavigation): string[] {
  try {
    return navigation.getState()?.routes.map((r) => r.name) ?? [];
  } catch {
    return [];
  }
}

function check(route: ListenerRoute, navigation: ListenerNavigation): void {
  const w = watches.get(route.key);
  if (!w || w.appeared || w.focusedAt == null) return;
  w.timer = null;
  let focused = false;
  try {
    focused = navigation.isFocused();
  } catch {
    focused = false;
  }
  if (!focused) return;
  if (AppState.currentState !== 'active') {
    // In the background nothing appears; look again once the app is back.
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      sub.remove();
      w.timer = setTimeout(() => check(route, navigation), NOT_PRESENTED_AFTER_MS);
    });
    return;
  }
  notPresentedCount += 1;
  w.reportedAt = Date.now();
  analytics.capture(ANALYTICS_EVENTS.NAV.SCREEN_NOT_PRESENTED, {
    route: w.name,
    ms_since_focus: Date.now() - w.focusedAt,
    stack: stackNames(navigation),
    not_presented_this_run: notPresentedCount,
    ...resumeContext(),
  });
}

/** Root Stack `screenListeners`. */
export function navPresenceListeners({
  route,
  navigation,
}: {
  route: ListenerRoute;
  navigation: ListenerNavigation;
}) {
  return {
    focus: () => {
      const w = watchFor(route);
      if (w.appeared) return;
      clearTimer(w);
      w.focusedAt = Date.now();
      w.timer = setTimeout(() => check(route, navigation), NOT_PRESENTED_AFTER_MS);
    },
    blur: () => {
      const w = watches.get(route.key);
      if (w) clearTimer(w);
    },
    transitionEnd: (e: { data?: { closing?: boolean } }) => {
      const w = watchFor(route);
      clearTimer(w);
      if (e.data?.closing) {
        w.appeared = false;
        return;
      }
      w.appeared = true;
      if (w.reportedAt != null && w.focusedAt != null) {
        analytics.capture(ANALYTICS_EVENTS.NAV.SCREEN_PRESENTED_LATE, {
          route: w.name,
          ms_since_focus: Date.now() - w.focusedAt,
          ...resumeContext(),
        });
      }
      w.reportedAt = null;
    },
    beforeRemove: () => {
      const w = watches.get(route.key);
      if (w) clearTimer(w);
      watches.delete(route.key);
    },
  };
}

/** Screens the router believes are open but iOS never showed, this run. */
export function notPresentedThisRun(): number {
  return notPresentedCount;
}
