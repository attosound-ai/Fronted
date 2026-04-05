/**
 * PostPublishedBanner - Slide-up notification confirming a post was shared.
 *
 * Usage:
 *   // 1. Mount once in the tabs layout:
 *   <PostPublishedBanner />
 *
 *   // 2. Trigger from anywhere:
 *   import { showPostPublished } from '@/components/ui/PostPublishedBanner';
 *   showPostPublished();
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  DeviceEventEmitter,
  PanResponder,
  TouchableOpacity,
  StyleSheet,
  View,
} from 'react-native';
import { CheckCircle, ChevronUp } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from './Text';

// ---------------------------------------------------------------------------
// Module-level bridge
// ---------------------------------------------------------------------------

type ShowFn = () => void;
let _show: ShowFn | null = null;

export function showPostPublished(): void {
  import('@/lib/haptics/hapticService').then(({ haptic }) => haptic('success'));
  _show?.();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const SLIDE_DISTANCE = 120;
const VISIBLE_DURATION = 4000;
const ANIMATION_DURATION = 320;
const DISMISS_THRESHOLD = 40;

export function PostPublishedBanner(): React.ReactElement | null {
  const { t } = useTranslation('feed');
  const [visible, setVisible] = useState(false);

  const translateY = useRef(new Animated.Value(SLIDE_DISTANCE)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAnimatingOut = useRef(false);

  const dismiss = useCallback(() => {
    if (isAnimatingOut.current) return;
    isAnimatingOut.current = true;
    if (dismissTimer.current) clearTimeout(dismissTimer.current);

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

  const show = useCallback(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    translateY.setValue(SLIDE_DISTANCE);
    opacity.setValue(0);
    isAnimatingOut.current = false;
    setVisible(true);

    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 10,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }),
    ]).start(() => {
      dismissTimer.current = setTimeout(dismiss, VISIBLE_DURATION);
    });
  }, [translateY, opacity, dismiss]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 5,
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) translateY.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > DISMISS_THRESHOLD) {
          dismiss();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 65,
            friction: 10,
          }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    _show = show;
    return () => {
      _show = null;
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [show]);

  const handlePress = () => {
    dismiss();
    DeviceEventEmitter.emit('feedScrollToTop');
  };

  if (!visible) return null;

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateY }], opacity }]}
      {...panResponder.panHandlers}
    >
      <TouchableOpacity
        style={styles.content}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <CheckCircle size={22} color="#22C55E" strokeWidth={2.25} />
        <View style={styles.textCol}>
          <Text style={styles.title}>
            {t('postPublished', { defaultValue: 'Your post has been shared!' })}
          </Text>
          <Text style={styles.subtitle}>
            {t('postPublishedTap', { defaultValue: 'Tap to view' })}
          </Text>
        </View>
        <ChevronUp size={16} color="#666" strokeWidth={2} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 100,
    left: '5%',
    right: '5%',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  textCol: {
    flex: 1,
    gap: 1,
  },
  title: {
    color: '#FFF',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 15,
    lineHeight: 20,
  },
  subtitle: {
    color: '#888',
    fontFamily: 'Archivo_400Regular',
    fontSize: 12,
    lineHeight: 16,
  },
});
