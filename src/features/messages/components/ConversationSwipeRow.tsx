import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Alert, StyleSheet, View, Pressable } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { Archive, BellOff, Bell, Pin, PinOff, Trash2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { COLORS } from '@/constants/theme';
import { haptic } from '@/lib/haptics/hapticService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { showToast } from '@/components/ui/Toast';
import { useConversationPrefsStore } from '../stores/conversationPrefsStore';
import { messageService } from '../services/messageService';
import type { ChatConversation } from '../types';

const ACTION_WIDTH = 78;
// The one colour on this screen. iOS paints a destructive swipe red and the
// app's own delete already reads red in the native long press menu, so a
// black or white button here would be the odd one out.
const DESTRUCTIVE = '#EF4444';

interface ConversationSwipeRowProps {
  conversation: ChatConversation;
  children: ReactNode;
}

/**
 * Swipe actions on a conversation row, the way iMessage and WhatsApp do it:
 * drag right to reveal Pin and Mute, drag left to reveal Delete and Archive,
 * with Delete at the edge where iOS puts the destructive one. The row itself
 * stays a plain pressable child.
 *
 * Pin, mute and archive are local to the device (see conversationPrefsStore).
 * Delete is not: it asks the server, which hides the chat for this user and
 * stamps the moment, so the messages do not come back with the next one. The
 * client, Sep 24: "Can we make it so you slide left to delete".
 */
export function ConversationSwipeRow({
  conversation,
  children,
}: ConversationSwipeRowProps) {
  const { t } = useTranslation('messages');
  const ref = useRef<SwipeableMethods>(null);
  const isPinned = useConversationPrefsStore(
    (s) => !!s.pinned[conversation.conversationId]
  );
  const isMuted = useConversationPrefsStore(
    (s) => !!s.muted[conversation.conversationId]
  );
  const togglePinned = useConversationPrefsStore((s) => s.togglePinned);
  const toggleMuted = useConversationPrefsStore((s) => s.toggleMuted);
  const archive = useConversationPrefsStore((s) => s.archive);
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(false);

  const remove = useCallback(async () => {
    const id = conversation.conversationId;
    setDeleting(true);
    try {
      await messageService.deleteConversation(id);
      // Drop it from the list at once, and drop its messages with it so a
      // chat that comes back does not show what was deleted from the cache.
      queryClient.setQueryData<ChatConversation[]>(
        QUERY_KEYS.MESSAGES.CONVERSATIONS(),
        (old) => (old ?? []).filter((c) => c.conversationId !== id)
      );
      queryClient.removeQueries({ queryKey: QUERY_KEYS.MESSAGES.CHAT(id) });
      showToast(t('listActions.deleted'));
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.CONVERSATION_DELETED, {
        conversation_id: id,
        unread_count: conversation.unreadCount,
      });
    } catch {
      showToast(t('listActions.deleteFailed'));
      setDeleting(false);
      ref.current?.close();
    }
  }, [conversation.conversationId, conversation.unreadCount, queryClient, t]);

  const confirmDelete = useCallback(() => {
    haptic('warning');
    const name = conversation.participantName || t('conversation.fallbackUserName');
    Alert.alert(
      t('listActions.deleteConfirmTitle'),
      t('listActions.deleteConfirmBody', { name }),
      [
        {
          text: t('actions.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
          onPress: () => ref.current?.close(),
        },
        {
          text: t('listActions.delete'),
          style: 'destructive',
          onPress: () => void remove(),
        },
      ]
    );
  }, [conversation.participantName, remove, t]);

  const run = useCallback(
    (action: 'pin' | 'mute' | 'archive') => {
      haptic('light');
      const id = conversation.conversationId;
      let value: boolean | null = null;
      if (action === 'pin') {
        value = togglePinned(id);
        analytics.capture(ANALYTICS_EVENTS.MESSAGES.CONVERSATION_PINNED, {
          conversation_id: id,
          pinned: value,
        });
      } else if (action === 'mute') {
        value = toggleMuted(id);
        analytics.capture(ANALYTICS_EVENTS.MESSAGES.CONVERSATION_MUTED, {
          conversation_id: id,
          muted: value,
        });
      } else {
        archive(id, conversation.lastMessageAt);
        analytics.capture(ANALYTICS_EVENTS.MESSAGES.CONVERSATION_ARCHIVED, {
          conversation_id: id,
          unread_count: conversation.unreadCount,
        });
      }
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.LIST_SWIPE_ACTION, {
        action,
        value,
        conversation_id: id,
      });
      ref.current?.close();
    },
    [conversation, togglePinned, toggleMuted, archive]
  );

  const renderLeft = useCallback(
    (_progress: SharedValue<number>, translation: SharedValue<number>) => (
      <View style={styles.leftActions}>
        <ActionButton
          index={0}
          side="left"
          translation={translation}
          label={isPinned ? t('listActions.unpin') : t('listActions.pin')}
          icon={
            isPinned ? (
              <PinOff size={22} color={COLORS.black} strokeWidth={2} />
            ) : (
              <Pin size={22} color={COLORS.black} strokeWidth={2} />
            )
          }
          background={COLORS.white}
          textColor={COLORS.black}
          onPress={() => run('pin')}
        />
        <ActionButton
          index={1}
          side="left"
          translation={translation}
          label={isMuted ? t('listActions.unmute') : t('listActions.mute')}
          icon={
            isMuted ? (
              <Bell size={22} color={COLORS.white} strokeWidth={2} />
            ) : (
              <BellOff size={22} color={COLORS.white} strokeWidth={2} />
            )
          }
          background={COLORS.gray[700]}
          textColor={COLORS.white}
          onPress={() => run('mute')}
        />
      </View>
    ),
    [isPinned, isMuted, run, t]
  );

  const renderRight = useCallback(
    (_progress: SharedValue<number>, translation: SharedValue<number>) => (
      <View style={styles.rightActions}>
        {/* The destructive one sits at the edge, where Mail and Messages put
            theirs, so the longest drag is the one that deletes. */}
        <ActionButton
          index={0}
          side="right"
          translation={translation}
          label={t('listActions.delete')}
          icon={<Trash2 size={22} color={COLORS.white} strokeWidth={2} />}
          background={DESTRUCTIVE}
          textColor={COLORS.white}
          onPress={confirmDelete}
          disabled={deleting}
        />
        <ActionButton
          index={1}
          side="right"
          translation={translation}
          label={t('listActions.archive')}
          icon={<Archive size={22} color={COLORS.white} strokeWidth={2} />}
          background={COLORS.gray[800]}
          textColor={COLORS.white}
          onPress={() => run('archive')}
        />
      </View>
    ),
    [confirmDelete, deleting, run, t]
  );

  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={1.6}
      leftThreshold={ACTION_WIDTH}
      rightThreshold={ACTION_WIDTH * 0.8}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={renderLeft}
      renderRightActions={renderRight}
      onSwipeableWillOpen={() => haptic('selection')}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

interface ActionButtonProps {
  index: number;
  side: 'left' | 'right';
  translation: SharedValue<number>;
  label: string;
  icon: ReactNode;
  background: string;
  textColor: string;
  onPress: () => void;
  disabled?: boolean;
}

/**
 * The buttons slide in with the row (iOS keeps them glued to the edge and
 * lets each one catch up as the drawer opens).
 */
function ActionButton({
  index,
  side,
  translation,
  label,
  icon,
  background,
  textColor,
  onPress,
  disabled = false,
}: ActionButtonProps) {
  const style = useAnimatedStyle(() => {
    const open = Math.abs(translation.value);
    const slot = (index + 1) * ACTION_WIDTH;
    const offset = Math.max(0, slot - open);
    return {
      transform: [{ translateX: side === 'left' ? -offset : offset }],
    };
  });
  return (
    <Animated.View style={[styles.actionSlot, style]}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={[styles.action, { backgroundColor: background }, disabled && styles.busy]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {icon}
        <Text
          style={[styles.actionLabel, { color: textColor }]}
          maxFontSizeMultiplier={1.0}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  leftActions: { flexDirection: 'row' },
  rightActions: { flexDirection: 'row-reverse' },
  actionSlot: { width: ACTION_WIDTH },
  action: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  busy: { opacity: 0.5 },
  actionLabel: {
    fontSize: 11,
    fontFamily: 'Archivo_600SemiBold',
  },
});
