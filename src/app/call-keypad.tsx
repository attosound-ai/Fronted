/**
 * In call keypad, drawn the way the Apple Phone app draws it: a translucent
 * panel that slides up from the bottom edge and stays flush with it, the
 * digits typed so far above the grid, Liquid Glass keys, and a Hide action.
 *
 * Why a route and not a sheet: iOS 26 floats every UISheetPresentationController
 * that is not at full height, with no public way to pin it to the bottom, and
 * that gap is exactly what David did not want. A transparent modal route is
 * still a native presentation (its own view controller, so it stacks above the
 * native call modal and survives lock and unlock), while the panel inside is
 * ours to place edge to edge.
 *
 * `callStore.keypadVisible` remains the single source of truth. DtmfKeypadHost
 * pushes this route when it turns true; this screen animates out and pops
 * itself when it turns false, or when the user hides, swipes down or taps
 * outside.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { DtmfKeypad } from '@/components/call/DtmfKeypad';
import { useCallStore } from '@/stores/callStore';
import { sendCallDigit } from '@/hooks/useTwilioVoice';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { haptic } from '@/lib/haptics/hapticService';
import { setCallKeypadRouteMounted } from '@/lib/callKeypadRoute';

/** Far enough that any panel height starts fully below the screen. */
const OFFSCREEN = 720;
/** Swipe distance or speed that counts as "hide". */
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 900;
/** iOS 26 sheets round their top at about this radius on a modern iPhone. */
const CORNER_RADIUS = 38;
/** Material strength. Lower lets more of the feed through the panel, which
 *  is the point of the glass (the client, Sep 22 2026: "we can actually enjoy
 *  the liquid glass display"; David, Sep 23: even more translucent). The tint
 *  stays ultra thin so the feed's colour comes through. */
const BLUR_INTENSITY = 38;
/** After the last digit on an inbound call, how long the pad waits for another
 *  digit before it slides away and the editor opens. */
const ACCEPT_HANDOFF_MS = 1500;
const OPEN_SPRING = { damping: 26, stiffness: 260, mass: 1 };

export default function CallKeypadScreen() {
  const { t } = useTranslation('calls');
  const insets = useSafeAreaInsets();

  const keypadVisible = useCallStore((s) => s.keypadVisible);
  const hideKeypad = useCallStore((s) => s.hideKeypad);
  const markDtmfSent = useCallStore((s) => s.markDtmfSent);
  const callSid = useCallStore((s) => s.activeCall?.callSid);
  const state = useCallStore((s) => s.activeCall?.state);
  const direction = useCallStore((s) => s.activeCall?.direction);
  const isConnected = state === 'connected';

  // Digits typed during this visit, echoed above the grid like Apple does.
  const [entered, setEntered] = useState('');
  // "Press 1 and the editor opens": on an inbound call the first digit marks
  // the call accepted, and once the creator stops typing for a beat the pad
  // slides away so useConnectedCallLanding can land on the recorder. A second
  // digit inside the window (Securus sometimes asks for more) resets it.
  const handoffTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (handoffTimer.current) clearTimeout(handoffTimer.current); }, []);

  const translateY = useSharedValue(OFFSCREEN);
  const backdrop = useSharedValue(0);
  const closingRef = useRef(false);

  const popSelf = useCallback(() => {
    if (router.canGoBack()) router.back();
  }, []);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    hideKeypad();
    backdrop.value = withTiming(0, { duration: 180 });
    translateY.value = withTiming(
      OFFSCREEN,
      { duration: 240, easing: Easing.in(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(popSelf)();
      }
    );
  }, [hideKeypad, backdrop, translateY, popSelf]);

  // Slide in on mount; report the mount so the host never pushes twice.
  useEffect(() => {
    setCallKeypadRouteMounted(true);
    translateY.value = withSpring(0, OPEN_SPRING);
    backdrop.value = withTiming(1, { duration: 220 });
    return () => {
      setCallKeypadRouteMounted(false);
      const cs = useCallStore.getState();
      // Popped by something other than `close` (a navigation underneath us)
      // while the call is still up: do NOT hide the keypad. The creator never
      // put it away, and on a Securus call the pad IS the call: without it the
      // "press 1" never goes out and the line drops at about a minute. Leave
      // the store true and DtmfKeypadHost presents the route again.
      if (!closingRef.current && cs.keypadVisible && cs.activeCall?.state === 'connected') {
        analytics.capture(ANALYTICS_EVENTS.CALL.KEYPAD_ROUTE_LOST, {
          call_sid: cs.activeCall?.callSid ?? null,
          direction: cs.activeCall?.direction ?? null,
        });
        return;
      }
      // Everything else (call ended, deliberate close): keep the store honest.
      cs.hideKeypad();
    };
  }, [translateY, backdrop]);

  // The store went false behind our back (call ended, another surface hid
  // the keypad): leave the same way the user would.
  useEffect(() => {
    if (!keypadVisible) close();
  }, [keypadVisible, close]);

  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .onUpdate((e) => {
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
        runOnJS(close)();
      } else {
        translateY.value = withSpring(0, OPEN_SPRING);
      }
    });

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  return (
    <View style={styles.root}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel={t('active.hideKeypad', 'Hide')}
        />
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.panel, panelStyle]}>
          {Platform.OS === 'ios' ? (
            <BlurView
              intensity={BLUR_INTENSITY}
              tint="systemUltraThinMaterialDark"
              pointerEvents="none"
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, styles.androidFill]}
            />
          )}

          <View style={[styles.body, { paddingBottom: insets.bottom + 8 }]}>
            <View style={styles.readout}>
              <RNText
                style={styles.readoutText}
                numberOfLines={1}
                ellipsizeMode="head"
                allowFontScaling={false}
                accessibilityLabel={entered ? entered.split('').join(' ') : undefined}
              >
                {entered}
              </RNText>
            </View>

            <DtmfKeypad
              onPressDigit={(d) => {
                setEntered((prev) => prev + d);
                void sendCallDigit(d).then((sent) => {
                  if (!sent || !callSid || direction !== 'inbound') return;
                  markDtmfSent(callSid);
                  if (handoffTimer.current) clearTimeout(handoffTimer.current);
                  handoffTimer.current = setTimeout(() => {
                    handoffTimer.current = null;
                    analytics.capture(ANALYTICS_EVENTS.CALL.KEYPAD_ACCEPT_HANDOFF, {
                      call_sid: callSid,
                      digits: entered.length + 1,
                    });
                    close();
                  }, ACCEPT_HANDOFF_MS);
                });
              }}
              onKeyTap={(digit, meta) =>
                analytics.capture(ANALYTICS_EVENTS.CALL.DTMF_KEYPRESS, {
                  digit,
                  // dropped=true: the tap registered but went nowhere because
                  // the keypad was disabled (call not yet connected).
                  dropped: meta.disabled,
                  call_state: state ?? null,
                  is_connected: isConnected,
                  call_sid: callSid ?? null,
                  direction: direction ?? null,
                  keypad_visible: keypadVisible,
                })
              }
              disabled={!isConnected}
            />

            <Pressable
              onPress={() => {
                void haptic('light');
                close();
              }}
              accessibilityRole="button"
              style={styles.hide}
              hitSlop={8}
            >
              <RNText style={styles.hideText} allowFontScaling={false}>
                {t('active.hideKeypad', 'Hide')}
              </RNText>
            </Pressable>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
  backdrop: {
    // Barely there: the feed behind the pad is the point of the glass
    // (David, Sep 23 2026, twice: "aun mas translucido").
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  panel: {
    borderTopLeftRadius: CORNER_RADIUS,
    borderTopRightRadius: CORNER_RADIUS,
    overflow: 'hidden',
    // A hairline lip so the panel edge reads over a bright call screen.
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  androidFill: {
    backgroundColor: 'rgba(18,18,20,0.94)',
  },
  body: {
    alignItems: 'center',
    paddingTop: 22,
  },
  readout: {
    // Fixed height so the grid never shifts as digits come in.
    height: 44,
    justifyContent: 'center',
    marginBottom: 12,
  },
  readoutText: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '300',
    letterSpacing: 1,
    textAlign: 'center',
  },
  hide: {
    marginTop: 18,
    paddingVertical: 8,
    paddingHorizontal: 24,
  },
  hideText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '400',
  },
});
