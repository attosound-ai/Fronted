import { useCallback, useRef, type ReactNode } from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { Archive, BellOff, Bell, Pin, PinOff } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { COLORS } from '@/constants/theme';
import { haptic } from '@/lib/haptics/hapticService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { useConversationPrefsStore } from '../stores/conversationPrefsStore';
import type { ChatConversation } from '../types';

const ACTION_WIDTH = 78;

interface ConversationSwipeRowProps {
  conversation: ChatConversation;
  children: ReactNode;
}

/**
 * Swipe actions on a conversation row, the way iMessage and WhatsApp do it:
 * drag right to reveal Pin and Mute, drag left to reveal Archive. The row
 * itself stays a plain pressable child. Everything is local to the device
 * (see conversationPrefsStore).
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
        <ActionButton
          index={0}
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
    [run, t]
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
        style={[styles.action, { backgroundColor: background }]}
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
  actionLabel: {
    fontSize: 11,
    fontFamily: 'Archivo_600SemiBold',
  },
});
