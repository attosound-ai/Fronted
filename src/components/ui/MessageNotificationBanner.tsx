/**
 * MessageNotificationBanner - Slide-down in-app notification for new messages.
 *
 * Similar to WhatsApp / Instagram: slides down from the top, shows sender
 * avatar + name + message preview, tappable to navigate to the chat.
 *
 * Usage:
 *   // 1. Mount once at a top-level layout:
 *   <MessageNotificationBanner />
 *
 *   // 2. Trigger from anywhere:
 *   import { showMessageNotification } from '@/components/ui/MessageNotificationBanner';
 *   showMessageNotification({ senderName: 'John', message: 'Hey!', ... });
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar } from './Avatar';
import { Text } from './Text';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MessageNotificationData {
  senderName: string;
  senderAvatar?: string | null;
  message: string;
  conversationId: string;
  senderId: string;
}

type ShowFn = (data: MessageNotificationData) => void;

// ---------------------------------------------------------------------------
// Module-level bridge (same pattern as Toast)
// ---------------------------------------------------------------------------

let _show: ShowFn | null = null;

export function showMessageNotification(data: MessageNotificationData): void {
  _show?.(data);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ANIMATION_DURATION = 300;
const VISIBLE_DURATION = 4000;

export function MessageNotificationBanner(): React.ReactElement | null {
  const { t } = useTranslation('messages');
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<MessageNotificationData | null>(null);
  const [visible, setVisible] = useState(false);

  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAnimatingOut = useRef(false);

  const dismiss = useCallback(() => {
    if (isAnimatingOut.current) return;
    isAnimatingOut.current = true;

    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -120,
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

  const show = useCallback(
    (notification: MessageNotificationData) => {
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
        dismissTimer.current = null;
      }

      translateY.setValue(-120);
      opacity.setValue(0);
      isAnimatingOut.current = false;

      setData(notification);
      setVisible(true);

      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 18,
          stiffness: 200,
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

  const handlePress = useCallback(() => {
    if (!data) return;
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
    dismiss();
    router.push({
      pathname: '/chat',
      params: {
        conversationId: data.conversationId,
        participantName: data.senderName,
        participantId: data.senderId,
      },
    });
  }, [data, dismiss]);

  useEffect(() => {
    _show = show;
    return () => {
      _show = null;
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [show]);

  if (!visible || !data) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { top: insets.top + 8, transform: [{ translateY }], opacity },
      ]}
    >
      <TouchableOpacity
        style={styles.content}
        onPress={handlePress}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`${t('header.title')} ${data.senderName}: ${data.message}`}
      >
        <Avatar uri={data.senderAvatar} size="sm" />
        <View style={styles.textContainer}>
          <Text variant="h3" numberOfLines={1} style={styles.name}>
            {data.senderName}
          </Text>
          <Text variant="caption" numberOfLines={1} style={styles.message}>
            {data.message}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 9999,
    elevation: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 16,
    padding: 12,
    gap: 12,
  },
  textContainer: {
    flex: 1,
    gap: 1,
  },
  name: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  message: {
    color: '#999999',
    fontSize: 13,
  },
});
