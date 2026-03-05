import { memo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { Text } from '@/components/ui/Text';
import { COLORS, SPACING } from '@/constants/theme';
import { formatRelativeTime } from '@/utils/formatters';
import type { ChatMessage } from '../types';

const SCREEN_WIDTH = Dimensions.get('window').width;

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
}

function MessageBubbleInner({ message, isOwn }: MessageBubbleProps) {
  return (
    <View style={[styles.wrapper, isOwn ? styles.wrapperOwn : styles.wrapperOther]}>
      <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
        <Text variant="body" style={styles.content}>
          {message.content}
        </Text>
        <Text variant="small" style={styles.time}>
          {message.createdAt ? formatRelativeTime(message.createdAt) : ''}
        </Text>
      </View>
    </View>
  );
}

export const MessageBubble = memo(MessageBubbleInner);

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.xs,
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
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: COLORS.background.secondary,
    borderBottomLeftRadius: 4,
  },
  content: {
    color: COLORS.white,
  },
  time: {
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
    alignSelf: 'flex-end',
  },
});
