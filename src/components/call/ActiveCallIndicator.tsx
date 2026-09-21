import { useEffect, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { usePathname, router } from 'expo-router';
import { Phone } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { useCallStore } from '@/stores/callStore';
import { isOnCallScreen, useScreenTopInset } from '@/hooks/useInCallChrome';

/**
 * ActiveCallIndicator — a minimal, always-present "on a call" status pill at the
 * top of the screen. Unlike CallBanner (a bottom "tap to record" CTA gated on
 * the record_upload entitlement), this shows for ANY connected call on ANY
 * account, so a call can never run invisibly.
 *
 * WHY (Sep 8 2026 incident): an inbound call for a linked CREATOR was adopted
 * while a REPRESENTATIVE account was active. CallBanner returns null without the
 * recording entitlement, so the rep saw no call UI at all — did not realize a
 * call was holding them, and could not find a way to end it. Tapping this pill
 * opens the call screen, where the call can be managed and ended.
 *
 * Monochrome by design (ATTO is black & white): white pill, black content.
 */
export function ActiveCallIndicator() {
  const { t } = useTranslation('calls');
  const activeCall = useCallStore((s) => s.activeCall);
  const pathname = usePathname();
  // Sits just under the in call bar (or under the status bar when the bar is
  // hidden) so it never covers the bar's mute, speaker and keypad buttons.
  const topInset = useScreenTopInset();
  const pulse = useRef(new Animated.Value(1)).current;

  const isConnected =
    activeCall?.state === 'connected' || activeCall?.state === 'reconnecting';

  useEffect(() => {
    if (!isConnected) {
      pulse.setValue(1);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [isConnected, pulse]);

  // The call screen and recorder own their own in-call chrome.
  // The keypad route is a see through modal over whichever screen was up, so
  // the pathname says nothing about what is underneath: stay out of the way.
  if (
    !isConnected ||
    isOnCallScreen(pathname) ||
    pathname.includes('/recording') ||
    pathname.includes('/call-keypad')
  ) {
    return null;
  }

  const label = activeCall?.callerUsername || activeCall?.fromNumber;

  return (
    <View style={[styles.wrapper, { top: topInset - 2 }]} pointerEvents="box-none">
      <TouchableOpacity
        style={styles.pill}
        onPress={() => router.push('/call')}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={t('activeIndicator.a11y', 'Return to active call')}
      >
        <Animated.View style={[styles.dot, { opacity: pulse }]} />
        <Phone size={14} color="#000000" strokeWidth={2.5} />
        <Text style={styles.text} numberOfLines={1}>
          {label
            ? t('activeIndicator.withLabel', {
                label,
                defaultValue: 'On a call with {{label}}',
              })
            : t('activeIndicator.default', 'On a call, tap to manage')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#000000',
  },
  text: {
    color: '#000000',
    fontSize: 13,
    fontFamily: 'Archivo_600SemiBold',
    flexShrink: 1,
  },
});
