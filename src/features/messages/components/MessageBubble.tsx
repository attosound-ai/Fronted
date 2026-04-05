import { memo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, { withSpring, withTiming, Easing } from 'react-native-reanimated';
import { CheckCheck, Check, Clock, AlertCircle } from 'lucide-react-native';
import { PostHogMaskView } from 'posthog-react-native';
import { Text } from '@/components/ui/Text';
import { COLORS, SPACING } from '@/constants/theme';
import { formatRelativeTime } from '@/utils/formatters';
import type { ChatMessage } from '../types';

/**
 * Telegram-style message send animation.
 * The bubble slides up ~35pt from below, scales from 0.92 to 1.0,
 * and fades in over 150ms. Spring is critically damped (no bounce).
 */
const messageSendEntering = () => {
  'worklet';
  return {
    initialValues: {
      opacity: 0,
      transform: [{ translateY: 35 }, { scale: 0.92 }],
    },
    animations: {
      opacity: withTiming(1, { duration: 150, easing: Easing.out(Easing.ease) }),
      transform: [
        { translateY: withSpring(0, { damping: 120, stiffness: 900, mass: 1 }) },
        { scale: withSpring(1, { damping: 120, stiffness: 900, mass: 1 }) },
      ],
    },
  };
};

const SCREEN_WIDTH = Dimensions.get('window').width;

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  isNew?: boolean;
}

function StatusIcon({ message }: { message: ChatMessage }) {
  if (message.status === 'sending') {
    return (
      <Clock
        size={12}
        color="rgba(0,0,0,0.35)"
        strokeWidth={2.25}
        style={styles.readIcon}
      />
    );
  }
  if (message.status === 'failed') {
    return (
      <AlertCircle size={12} color="#EF4444" strokeWidth={2.25} style={styles.readIcon} />
    );
  }
  if (message.isRead) {
    return (
      <CheckCheck
        size={14}
        color={COLORS.black}
        strokeWidth={2.25}
        style={styles.readIcon}
      />
    );
  }
  return (
    <Check
      size={14}
      color="rgba(0,0,0,0.35)"
      strokeWidth={2.25}
      style={styles.readIcon}
    />
  );
}

function MessageBubbleInner({ message, isOwn, isNew }: MessageBubbleProps) {
  const isSending = message.status === 'sending';

  const bubble = (
    <PostHogMaskView>
      <View
        style={[
          styles.bubble,
          isOwn ? styles.bubbleOwn : styles.bubbleOther,
          isSending && styles.bubbleSending,
        ]}
      >
        <Text variant="body" style={[styles.content, isOwn && styles.contentOwn]}>
          {message.content}
        </Text>
        <View style={styles.meta}>
          <Text variant="small" style={[styles.time, isOwn && styles.timeOwn]}>
            {message.createdAt ? formatRelativeTime(message.createdAt) : ''}
          </Text>
          {isOwn && <StatusIcon message={message} />}
        </View>
      </View>
    </PostHogMaskView>
  );

  // Telegram-style slide-up animation for newly sent own messages
  if (isNew && isOwn) {
    return (
      <Animated.View
        entering={messageSendEntering}
        style={[styles.wrapper, styles.wrapperOwn]}
      >
        {bubble}
      </Animated.View>
    );
  }

  return (
    <View style={[styles.wrapper, isOwn ? styles.wrapperOwn : styles.wrapperOther]}>
      {bubble}
    </View>
  );
}

export const MessageBubble = memo(MessageBubbleInner);

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  wrapperOwn: {
    alignItems: 'flex-end',
  },
  wrapperOther: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: SCREEN_WIDTH * 0.75,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 16,
  },
  bubbleOwn: {
    backgroundColor: COLORS.white,
    borderBottomRightRadius: 4,
  },
  bubbleSending: {
    opacity: 0.7,
  },
  bubbleOther: {
    backgroundColor: COLORS.gray[800],
    borderBottomLeftRadius: 4,
  },
  content: {
    color: COLORS.white,
  },
  contentOwn: {
    color: COLORS.black,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 3,
    marginTop: 2,
  },
  time: {
    color: 'rgba(255,255,255,0.6)',
  },
  timeOwn: {
    color: 'rgba(0,0,0,0.45)',
  },
  readIcon: {
    marginLeft: 2,
  },
});
