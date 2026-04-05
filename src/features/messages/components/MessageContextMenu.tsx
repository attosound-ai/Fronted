/**
 * MessageContextMenu — Telegram-style context menu positioned around the message.
 *
 * The selected message stays at its original position. Emoji reactions
 * appear above it, action buttons below it.
 */

import { memo, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Dimensions,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import * as Clipboard from 'expo-clipboard';
import { Reply, Copy, Pencil, Trash2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { COLORS } from '@/constants/theme';
import { showToast } from '@/components/ui/Toast';

const QUICK_EMOJIS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];
const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const EMOJI_ROW_HEIGHT = 48;
const BUBBLE_ESTIMATE = 50;

interface MessageContextMenuProps {
  visible: boolean;
  messageText: string;
  isOwn: boolean;
  senderName: string;
  pressY: number;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function MessageContextMenuInner({
  visible,
  messageText,
  isOwn,
  senderName,
  pressY,
  onClose,
  onReact,
  onReply,
  onEdit,
  onDelete,
}: MessageContextMenuProps) {
  const { t } = useTranslation('messages');

  const handleCopy = useCallback(async () => {
    await Clipboard.setStringAsync(messageText);
    showToast(t('actions.copied', { defaultValue: 'Copied' }));
    onClose();
  }, [messageText, onClose, t]);

  if (!visible) return null;

  // Position everything relative to the press point.
  // The bubble sits at pressY, emojis above, actions below.
  // Clamp so nothing goes off-screen.
  const bubbleTop = Math.max(
    EMOJI_ROW_HEIGHT + 60,
    Math.min(pressY - BUBBLE_ESTIMATE / 2, SCREEN_HEIGHT - 300)
  );
  const emojiTop = bubbleTop - EMOJI_ROW_HEIGHT - 8;
  const actionsTop = bubbleTop + BUBBLE_ESTIMATE + 8;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Dimmed backdrop */}
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(100)}
          style={styles.backdrop}
        />
      </TouchableWithoutFeedback>

      {/* Emoji row — positioned above the message */}
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(100)}
        style={[
          styles.emojiRow,
          { top: emojiTop },
          isOwn ? styles.alignRight : styles.alignLeft,
        ]}
      >
        {QUICK_EMOJIS.map((emoji) => (
          <TouchableOpacity
            key={emoji}
            style={styles.emojiButton}
            onPress={() => {
              onReact(emoji);
              onClose();
            }}
            activeOpacity={0.6}
          >
            <Text style={styles.emoji}>{emoji}</Text>
          </TouchableOpacity>
        ))}
      </Animated.View>

      {/* Highlighted bubble — at the original message position */}
      <Animated.View
        entering={FadeIn.duration(150)}
        exiting={FadeOut.duration(100)}
        style={[
          styles.highlightBubble,
          isOwn ? styles.bubbleOwn : styles.bubbleOther,
          { top: bubbleTop },
          isOwn ? styles.alignRight : styles.alignLeft,
        ]}
      >
        {!isOwn && <Text style={styles.bubbleName}>{senderName}</Text>}
        <Text
          style={[styles.bubbleText, isOwn && { color: COLORS.black }]}
          numberOfLines={4}
        >
          {messageText}
        </Text>
      </Animated.View>

      {/* Actions — positioned below the message */}
      <Animated.View
        entering={FadeIn.delay(50).duration(200)}
        exiting={FadeOut.duration(100)}
        style={[
          styles.actionsCard,
          { top: actionsTop },
          isOwn ? styles.alignRight : styles.alignLeft,
        ]}
      >
        <ActionRow
          icon={<Reply size={17} color={COLORS.white} strokeWidth={1.75} />}
          label={t('actions.reply', { defaultValue: 'Reply' })}
          onPress={() => {
            onReply();
            onClose();
          }}
        />
        <ActionRow
          icon={<Copy size={17} color={COLORS.white} strokeWidth={1.75} />}
          label={t('actions.copy', { defaultValue: 'Copy' })}
          onPress={handleCopy}
        />
        {isOwn && (
          <ActionRow
            icon={<Pencil size={17} color={COLORS.white} strokeWidth={1.75} />}
            label={t('actions.edit', { defaultValue: 'Edit' })}
            onPress={() => {
              onEdit();
              onClose();
            }}
          />
        )}
        {isOwn && (
          <ActionRow
            icon={<Trash2 size={17} color="#EF4444" strokeWidth={1.75} />}
            label={t('actions.delete', { defaultValue: 'Delete' })}
            onPress={() => {
              onDelete();
              onClose();
            }}
            destructive
            isLast
          />
        )}
      </Animated.View>
    </View>
  );
}

function ActionRow({
  icon,
  label,
  onPress,
  destructive,
  isLast,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  isLast?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.actionRow, !isLast && styles.actionRowBorder]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {icon}
      <Text style={[styles.actionLabel, destructive && styles.actionLabelDestructive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export const MessageContextMenu = memo(MessageContextMenuInner);

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
  },
  // Positioning helpers
  alignLeft: {
    left: 12,
  },
  alignRight: {
    right: 12,
  },
  // Emoji row
  emojiRow: {
    position: 'absolute',
    flexDirection: 'row',
    backgroundColor: '#2C2C2E',
    borderRadius: 22,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  emojiButton: {
    width: 40,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emoji: {
    fontSize: 22,
  },
  // Highlighted bubble
  highlightBubble: {
    position: 'absolute',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    maxWidth: 260,
  },
  bubbleOwn: {
    backgroundColor: COLORS.white,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: COLORS.gray[800],
    borderBottomLeftRadius: 4,
  },
  bubbleName: {
    color: '#3B82F6',
    fontSize: 12,
    fontFamily: 'Archivo_600SemiBold',
    marginBottom: 2,
  },
  bubbleText: {
    color: COLORS.white,
    fontSize: 15,
    fontFamily: 'Archivo_400Regular',
  },
  // Actions card
  actionsCard: {
    position: 'absolute',
    backgroundColor: '#2C2C2E',
    borderRadius: 14,
    overflow: 'hidden',
    minWidth: 200,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  actionRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#3A3A3C',
  },
  actionLabel: {
    color: COLORS.white,
    fontSize: 15,
    fontFamily: 'Archivo_400Regular',
  },
  actionLabelDestructive: {
    color: '#EF4444',
  },
});
