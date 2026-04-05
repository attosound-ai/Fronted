import { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mic } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { useCallStore } from '@/stores/callStore';
import { ProjectPickerSheet } from './ProjectPickerSheet';

// ── CallBanner ─────────────────────────────────────────────
// Red floating CTA above tab bar. Visible during an active connected call.

export function CallBanner() {
  const { t } = useTranslation('calls');
  const activeCall = useCallStore((s) => s.activeCall);
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [pickerVisible, setPickerVisible] = useState(false);

  const isConnected =
    activeCall?.state === 'connected' || activeCall?.state === 'reconnecting';
  const isOnRecordingScreen = pathname === '/recording';

  // Pulsing white dot
  useEffect(() => {
    if (!isConnected) {
      pulseAnim.setValue(1);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [isConnected, pulseAnim]);

  if (!isConnected || isOnRecordingScreen) return null;

  // Position above tab bar (49pt) + bottom safe area
  const bottomOffset = 49 + insets.bottom;

  return (
    <View style={[bannerStyles.wrapper, { bottom: bottomOffset + 8 }]}>
      <TouchableOpacity
        style={bannerStyles.container}
        onPress={() => setPickerVisible(true)}
        activeOpacity={0.8}
      >
        <Animated.View style={[bannerStyles.recordCircle, { opacity: pulseAnim }]}>
          <View style={bannerStyles.recordInner} />
        </Animated.View>
        <View style={bannerStyles.textContainer}>
          <Text variant="small" style={bannerStyles.title}>
            {t('banner.tapToRecord')}
          </Text>
          <Text variant="small" style={bannerStyles.subtitle}>
            {t('banner.callInProgress')}
          </Text>
        </View>
        <Mic size={18} color="#FFF" strokeWidth={2.25} />
      </TouchableOpacity>
      <ProjectPickerSheet
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
      />
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#B91C1C',
    borderRadius: 24,
    paddingVertical: 8,
    paddingHorizontal: 14,
    gap: 8,
    shadowColor: '#B91C1C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  recordCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
  },
  textContainer: {},
  title: {
    color: '#FFF',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 13,
    lineHeight: 17,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontFamily: 'Archivo_400Regular',
    fontSize: 10,
    lineHeight: 14,
  },
});
