/**
 * Toast - Imperative slide-up notification pill
 *
 * Usage:
 *   // 1. Mount once at the top level of your screen or layout:
 *   <Toast />
 *
 *   // 2. Trigger from anywhere (no ref/context needed):
 *   import { showToast } from '@/components/ui/Toast';
 *   showToast('Copied to clipboard');
 *
 * Pattern: module-level setter registered on mount, similar to
 * react-native-toast-message. Only one <Toast /> should be mounted
 * at a time in a given navigation scope.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { CheckCircle } from 'lucide-react-native';
import { Text } from './Text';

// ---------------------------------------------------------------------------
// Module-level state bridge
// ---------------------------------------------------------------------------

type ShowFn = (message: string) => void;

/**
 * STACK of mounted hosts, most recent last. Several screens mount their own
 * <Toast /> (the in-call editor lives in a Modal, so it needs its own); the
 * old single `_show` slot was nulled by WHICHEVER host unmounted, so closing
 * the editor killed every toast app-wide until another host screen mounted.
 * That is why David saw neither the weak-signal toast nor any call feedback
 * on Aug 30 while telemetry claimed toast_shown. A stack restores the
 * previous host when one unmounts.
 */
const _hosts: ShowFn[] = [];

function registerToastHost(show: ShowFn): () => void {
  _hosts.push(show);
  return () => {
    const i = _hosts.lastIndexOf(show);
    if (i >= 0) _hosts.splice(i, 1);
  };
}

/**
 * showToast - call from anywhere to display the toast.
 * Returns whether a mounted host actually displayed it, so callers can report
 * the truth (an emitted event is not a shown toast).
 */
export function showToast(message: string): boolean {
  const host = _hosts[_hosts.length - 1];
  if (!host) return false;
  host(message);
  return true;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const SLIDE_DISTANCE = 80; // px below final position before animating in
const VISIBLE_DURATION = 2000; // ms the toast stays fully visible
const ANIMATION_DURATION = 280; // ms for slide in / out

export function Toast(): React.ReactElement | null {
  const [message, setMessage] = useState<string>('');
  const [visible, setVisible] = useState<boolean>(false);

  const translateY = useRef(new Animated.Value(SLIDE_DISTANCE)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAnimatingOut = useRef<boolean>(false);

  // Slide-out + hide
  const dismiss = useCallback(() => {
    if (isAnimatingOut.current) return;
    isAnimatingOut.current = true;

    Animated.parallel([
      Animated.timing(translateY, {
        toValue: SLIDE_DISTANCE,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setVisible(false);
      isAnimatingOut.current = false;
    });
  }, [translateY, opacity]);

  // Slide-in, then schedule dismiss
  const show = useCallback(
    (msg: string) => {
      // Cancel any in-flight dismiss timer so back-to-back calls work cleanly
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
        dismissTimer.current = null;
      }

      // Reset animation values before starting (handles rapid re-calls)
      translateY.setValue(SLIDE_DISTANCE);
      opacity.setValue(0);
      isAnimatingOut.current = false;

      setMessage(msg);
      setVisible(true);

      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: ANIMATION_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: ANIMATION_DURATION,
          useNativeDriver: true,
        }),
      ]).start(() => {
        dismissTimer.current = setTimeout(dismiss, VISIBLE_DURATION);
      });
    },
    [translateY, opacity, dismiss]
  );

  // Register on the host stack; unmount restores the previous host.
  useEffect(() => {
    const unregister = registerToastHost(show);
    return () => {
      unregister();
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [show]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateY }], opacity }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={message}
    >
      <CheckCircle size={20} color="#3B82F6" strokeWidth={2.25} style={styles.icon} />
      <Text style={styles.message} numberOfLines={2}>
        {message}
      </Text>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 16,
    maxWidth: '85%',
    // Elevation for Android shadow
    elevation: 8,
    // Shadow for iOS
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  icon: {
    marginRight: 8,
  },
  message: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_500Medium',
    fontSize: 14,
    lineHeight: 20,
    flexShrink: 1,
  },
});
