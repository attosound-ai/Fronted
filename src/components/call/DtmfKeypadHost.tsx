import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { router, usePathname, useRootNavigationState } from 'expo-router';

import { useCallStore } from '@/stores/callStore';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { probeResume } from '@/lib/telemetry/resumeProbe';
import { useCallKeypadRouteMounted } from '@/lib/callKeypadRoute';
import { isOnCallScreen } from '@/hooks/useInCallChrome';

/**
 * Global host for the in call DTMF keypad. Mounted once at the root so a
 * single keypad serves every call surface (InCallTopBar, ActiveCallScreen,
 * SimpleRecordingScreen) with no per screen state to duplicate.
 *
 * Three responsibilities, all presentation level:
 *  1. Present the keypad when `callStore.keypadVisible` turns true. The keypad
 *     itself is the /call-keypad transparent modal route (see that file for
 *     why it is a route and not a sheet); this host only pushes it, and only
 *     when it is not already on screen. The route pops itself.
 *  2. Auto open the keypad once when an INBOUND call connects. Almost every
 *     inbound call on ATTO is a Securus inmate call that needs "press 1", so
 *     the keypad should be front and center the moment the call connects. It
 *     never auto SENDS a digit; the user still taps deliberately.
 *  3. Record which surface was up on every foreground resume.
 */
export function DtmfKeypadHost() {
  const keypadVisible = useCallStore((s) => s.keypadVisible);
  const showKeypad = useCallStore((s) => s.showKeypad);
  const routeMounted = useCallKeypadRouteMounted();

  const callSid = useCallStore((s) => s.activeCall?.callSid);
  const state = useCallStore((s) => s.activeCall?.state);
  const direction = useCallStore((s) => s.activeCall?.direction);

  const isConnected = state === 'connected';

  // Foreground resume handling. We only auto open while truly active so the
  // keypad is never presented while backgrounded, and RESUME_SURFACE_SNAPSHOT
  // keeps recording which surface was up during the call.
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      const active = s === 'active';
      setAppActive(active);
      if (!active) return;
      const cs = useCallStore.getState();
      if (cs.activeCall) {
        // probeResume adds the compositor liveness signal (raf_fired) plus
        // suspension depth so a black resume is distinguishable from a
        // healthy one.
        probeResume('call_resume_surface_snapshot', {
          keypad_visible: cs.keypadVisible,
          call_state: cs.activeCall.state,
          direction: cs.activeCall.direction,
        });
      }
    });
    return () => sub.remove();
  }, []);

  // Auto open once per call: remember the SID we've already opened for so the
  // keypad doesn't pop back up if the user dismissed it mid call.
  const autoOpenedSidRef = useRef<string | null>(null);
  useEffect(() => {
    if (!callSid) {
      autoOpenedSidRef.current = null;
      return;
    }
    if (
      isConnected &&
      direction === 'inbound' &&
      appActive &&
      autoOpenedSidRef.current !== callSid
    ) {
      autoOpenedSidRef.current = callSid;
      showKeypad();
      analytics.capture(ANALYTICS_EVENTS.CALL.KEYPAD_AUTO_OPENED, {
        call_sid: callSid,
        direction,
      });
    }
  }, [callSid, isConnected, direction, appActive, showKeypad]);

  // Store says visible and the route is not up: present it. The route pops
  // itself when the store goes false, so there is no matching "hide" branch.
  // Wait for the root navigator: a push fired during a cold start deep link
  // is dropped silently, and the store would then sit at true with nothing
  // on screen.
  const navReady = !!useRootNavigationState()?.key;
  // Never present the keypad while /call is on top. That screen is a native
  // modal handing itself off the moment the call connects, which is exactly
  // when the auto open fires. Pushing a second modal into that hand off left
  // the call modal presented with the tabs drawn INSIDE it: the whole app
  // slid down as a card and the modal hid the in call bar (Sep 20 2026).
  // The pathname is a dependency, so the keypad opens as soon as we land.
  const pathname = usePathname();
  const handingOff = isOnCallScreen(pathname);
  useEffect(() => {
    if (!navReady || handingOff) return;
    if (keypadVisible && !routeMounted) {
      router.push('/call-keypad');
    }
  }, [keypadVisible, routeMounted, navReady, handingOff]);

  return null;
}

/** Open the keypad from a control bar button. */
export function openKeypad() {
  useCallStore.getState().showKeypad();
  analytics.capture(ANALYTICS_EVENTS.CALL.KEYPAD_OPENED);
}
