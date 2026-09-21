import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  FlatList,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
  LinearTransition,
  useSharedValue,
  ZoomIn,
  ZoomOut,
} from 'react-native-reanimated';
import { ChevronDown } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { COLORS } from '@/constants/theme';
import { haptic } from '@/lib/haptics/hapticService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import type { AttoMessage } from '../utils/messageAdapter';
import { MessageRow, sentFromComposer, type MenuItem } from './MessageRow';
import {
  dayLabel,
  groupPositions,
  unreadDividerIndex,
  needsDayPill,
  shouldShowJumpPill,
  type ThreadItem,
} from './threadModel';

// Older rows slide up smoothly when a new bubble is inserted (Telegram),
// instead of jumping the height of the new row in one frame.
const rowLayout = LinearTransition.duration(220).easing(Easing.out(Easing.cubic));

export interface ChatThreadHandle {
  scrollToBottom: (animated?: boolean) => void;
  scrollToMessage: (messageId: string) => void;
}

export interface ChatThreadProps {
  /** Replies per thread root, for the footer under a bubble. */
  threadCounts?: Map<string, number>;
  onOpenThread?: (messageId: string) => void;
  /**
   * Unread count when the chat was opened: draws the "new messages" line
   * above the oldest unread message (WhatsApp, Telegram). Fixed for the
   * life of the screen so the line does not jump when marking as read.
   */
  initialUnreadCount?: number;
  /** Newest first, the way the inverted list draws them. */
  messages: AttoMessage[];
  currentUserId: string;
  /** Id of the message this device just sent, so only it slides in from the composer. */
  justSentId: string | null;
  /** Which participants are creators (their bubbles wear gold). */
  creatorIds: ReadonlySet<string>;
  isParticipantTyping: boolean;
  participantName: string;
  hasMore: boolean;
  isFetchingMore: boolean;
  onLoadMore: () => void;
  menuItemsFor: (message: AttoMessage, isOwn: boolean) => MenuItem[];
  onMenuAction: (actionKey: string, message: AttoMessage) => void;
  onReply: (message: AttoMessage) => void;
  onDoubleTap: (
    message: AttoMessage,
    rect: { x: number; y: number; width: number; height: number }
  ) => void;
  /** Reply mode: the message being answered stays bright, the rest dims. */
  focusedId: string | null;
  /** When the other side last read our messages, as an ISO time, for the Read label. */
  readAt: string | null;
  onToggleReaction: (message: AttoMessage, emoji: string) => void;
  renderMedia?: (message: AttoMessage) => React.ReactNode;
  /** Space kept clear at the bottom (composer height) so the last bubble is never covered. */
  bottomInset: number;
  /** Extra top space for the floating day pill and the header. */
  topInset: number;
}

const DAY_PILL_HIDE_MS = 1200;

/**
 * The message list: an inverted FlatList that keeps its scroll position when
 * history loads above, a day pill that floats while you scroll and fades away
 * when you stop, a typing bubble that pops in at the bottom, and a "jump to
 * latest" pill (with the count of what arrived meanwhile) once you are far
 * from the end. Every row is a MessageRow with its own gestures.
 */
export const ChatThread = forwardRef<ChatThreadHandle, ChatThreadProps>(
  function ChatThread(
    {
      messages,
      currentUserId,
      initialUnreadCount = 0,
      threadCounts,
      onOpenThread,
      justSentId,
      creatorIds,
      isParticipantTyping,
      participantName,
      hasMore,
      isFetchingMore,
      onLoadMore,
      menuItemsFor,
      onMenuAction,
      onReply,
      onDoubleTap,
      onToggleReaction,
      renderMedia,
      bottomInset,
      topInset,
      focusedId,
      readAt,
    },
    ref
  ) {
    const { t } = useTranslation('messages');
    // Drag any bubble left to peek at every time (iMessage): rows share this
    // value, so the whole thread moves together.
    const timesReveal = useSharedValue(0);
    const reportTimesRevealed = useCallback(() => {
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.TIMES_REVEALED, {
        message_count: messages.length,
      });
    }, [messages.length]);
    const listRef = useRef<FlatList<AttoMessage>>(null);
    const [farFromBottom, setFarFromBottom] = useState(false);
    const [unseenCount, setUnseenCount] = useState(0);
    const [floatingDay, setFloatingDay] = useState<string | null>(null);
    const [dayVisible, setDayVisible] = useState(false);
    const dayHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastNewestId = useRef<string | null>(
      messages[0]?._id ? String(messages[0]._id) : null
    );

    const items: ThreadItem[] = useMemo(
      () =>
        messages.map((m) => ({
          id: String(m._id),
          senderId: String(m.user._id),
          createdAt: new Date(m.createdAt).getTime(),
          text: m.text,
          deleted: m.isDeleted,
        })),
      [messages]
    );
    const positions = useMemo(() => groupPositions(items), [items]);
    const dividerIndex = useMemo(
      () => unreadDividerIndex(items, currentUserId, initialUnreadCount),
      [items, currentUserId, initialUnreadCount]
    );
    const dividerReported = useRef(false);
    useEffect(() => {
      if (dividerIndex === null || dividerReported.current) return;
      dividerReported.current = true;
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.UNREAD_DIVIDER_SHOWN, {
        unread_count: initialUnreadCount,
        index: dividerIndex,
      });
    }, [dividerIndex, initialUnreadCount]);
    const readLabelId = useMemo(() => {
      const m = messages.find(
        (x) => String(x.user._id) === currentUserId && !x.isDeleted && x.received
      );
      return m ? String(m._id) : null;
    }, [messages, currentUserId]);
    const readLabelText = useMemo(() => {
      if (!readAt) return t('chat.read', { defaultValue: 'Read' });
      const time = new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(readAt));
      return `${t('chat.read', { defaultValue: 'Read' })} ${time}`;
    }, [readAt, t]);
    const dayWords = useMemo(
      () => ({
        today: t('day.today', { defaultValue: 'Today' }),
        yesterday: t('day.yesterday', { defaultValue: 'Yesterday' }),
      }),
      [t]
    );
    const labels = useMemo(
      () => ({
        you: t('chat.you', { defaultValue: 'You' }),
        deleted: t('chat.messageDeleted', { defaultValue: 'Message deleted' }),
        edited: t('chat.edited', { defaultValue: 'edited' }),
      }),
      [t]
    );

    // Count messages that arrive from the other side while the user is away
    // from the bottom; own sends always scroll down and reset it.
    useEffect(() => {
      const newest = messages[0];
      const newestId = newest ? String(newest._id) : null;
      if (newestId === lastNewestId.current) return;
      lastNewestId.current = newestId;
      if (!newest) return;
      const own = String(newest.user._id) === currentUserId;
      if (own || !farFromBottom) {
        setUnseenCount(0);
        if (own) listRef.current?.scrollToOffset({ offset: 0, animated: true });
      } else {
        setUnseenCount((n) => n + 1);
      }
    }, [messages, currentUserId, farFromBottom]);

    const scrollToBottom = useCallback((animated = true) => {
      listRef.current?.scrollToOffset({ offset: 0, animated });
      setUnseenCount(0);
    }, []);

    const scrollToMessage = useCallback(
      (messageId: string) => {
        const index = messages.findIndex((m) => String(m._id) === messageId);
        if (index < 0) return;
        listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
      },
      [messages]
    );

    useImperativeHandle(ref, () => ({ scrollToBottom, scrollToMessage }), [
      scrollToBottom,
      scrollToMessage,
    ]);

    const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const far = shouldShowJumpPill(y);
      setFarFromBottom((prev) => (prev === far ? prev : far));
      if (!far) setUnseenCount(0);
      setDayVisible(true);
      if (dayHideTimer.current) clearTimeout(dayHideTimer.current);
      dayHideTimer.current = setTimeout(() => setDayVisible(false), DAY_PILL_HIDE_MS);
    }, []);

    useEffect(
      () => () => {
        if (dayHideTimer.current) clearTimeout(dayHideTimer.current);
      },
      []
    );

    const onViewableItemsChanged = useRef(
      ({
        viewableItems,
      }: {
        viewableItems: { item: AttoMessage; isViewable: boolean }[];
      }) => {
        // The topmost visible message (largest index in an inverted list).
        const top = viewableItems.filter((v) => v.isViewable).at(-1)?.item;
        if (!top) return;
        setFloatingDay(
          dayLabel(new Date(top.createdAt).getTime(), Date.now(), dayWordsRef.current)
        );
      }
    ).current;
    const dayWordsRef = useRef(dayWords);
    dayWordsRef.current = dayWords;

    const renderItem = useCallback(
      ({ item, index }: ListRenderItemInfo<AttoMessage>) => {
        const isOwn = String(item.user._id) === currentUserId;
        const pos = positions[index] ?? { first: true, last: true };
        const pill = needsDayPill(items, index)
          ? dayLabel(items[index].createdAt, Date.now(), dayWords)
          : null;
        const row = (
          <MessageRow
            message={item}
            isOwn={isOwn}
            position={pos}
            currentUserId={currentUserId}
            justSent={justSentId === String(item._id)}
            senderIsCreator={creatorIds.has(String(item.user._id))}
            menuItems={menuItemsFor(item, isOwn)}
            labels={labels}
            onMenuAction={onMenuAction}
            onReply={onReply}
            onDoubleTap={onDoubleTap}
            onToggleReaction={onToggleReaction}
            onPressQuote={scrollToMessage}
            renderMedia={renderMedia}
            dimmed={focusedId !== null && focusedId !== String(item._id)}
            timesReveal={timesReveal}
            onTimesRevealed={reportTimesRevealed}
            readLabel={readLabelId === String(item._id) ? readLabelText : null}
            threadReplies={threadCounts?.get(String(item._id)) ?? 0}
            onOpenThread={onOpenThread}
          />
        );
        const body =
          justSentId === String(item._id) ? (
            <Animated.View entering={sentFromComposer}>{row}</Animated.View>
          ) : (
            row
          );
        return (
          <Animated.View layout={rowLayout}>
            {pill ? (
              <View style={styles.dayRow}>
                <View style={styles.dayPill}>
                  <RNText style={styles.dayText} maxFontSizeMultiplier={1.1}>
                    {pill}
                  </RNText>
                </View>
              </View>
            ) : null}
            {dividerIndex === index ? (
              <View style={styles.unreadRow}>
                <View style={styles.unreadLine} />
                <RNText style={styles.unreadText} maxFontSizeMultiplier={1.1}>
                  {t('thread.newMessages')}
                </RNText>
                <View style={styles.unreadLine} />
              </View>
            ) : null}
            {body}
          </Animated.View>
        );
      },
      [
        dividerIndex,
        t,
        currentUserId,
        positions,
        items,
        dayWords,
        justSentId,
        creatorIds,
        menuItemsFor,
        labels,
        onMenuAction,
        onReply,
        onDoubleTap,
        onToggleReaction,
        scrollToMessage,
        renderMedia,
        focusedId,
        timesReveal,
        reportTimesRevealed,
        readLabelId,
        threadCounts,
        onOpenThread,
        readLabelText,
      ]
    );

    // The optimistic temp row and its server copy share one key.
    const keyExtractor = useCallback(
      (m: AttoMessage) => m.clientKey ?? String(m._id),
      []
    );
    const reportedRef = useRef(false);
    useEffect(() => {
      if (reportedRef.current || messages.length === 0) return;
      reportedRef.current = true;
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.THREAD_RENDERED, {
        message_count: messages.length,
        creator_count: creatorIds.size,
        has_more: hasMore,
      });
    }, [messages.length, creatorIds.size, hasMore]);

    return (
      <View style={styles.root}>
        <FlatList
          ref={listRef}
          data={messages}
          inverted
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          onScroll={onScroll}
          scrollEventThrottle={32}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 10 }}
          onEndReached={hasMore && !isFetchingMore ? onLoadMore : undefined}
          onEndReachedThreshold={0.6}
          // Loading history above must not move what the user is reading.
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingTop: bottomInset + 8,
            paddingBottom: topInset + 12,
          }}
          ListHeaderComponent={
            isParticipantTyping ? (
              <Animated.View
                entering={ZoomIn.duration(180)}
                exiting={ZoomOut.duration(160)}
                style={styles.typingRow}
              >
                <TypingBubble />
              </Animated.View>
            ) : null
          }
          ListFooterComponent={
            isFetchingMore ? (
              <Animated.View
                entering={FadeIn}
                exiting={FadeOut}
                style={styles.loadingRow}
              >
                <RNText style={styles.loadingText}>
                  {t('chat.loadingEarlier', { defaultValue: 'Loading…' })}
                </RNText>
              </Animated.View>
            ) : null
          }
          removeClippedSubviews={false}
          showsVerticalScrollIndicator={false}
        />

        {floatingDay && dayVisible ? (
          <Animated.View
            entering={FadeInDown.duration(160)}
            exiting={FadeOutDown.duration(220)}
            pointerEvents="none"
            style={[styles.floatingDay, { top: topInset + 8 }]}
          >
            <View style={styles.dayPill}>
              <RNText style={styles.dayText} maxFontSizeMultiplier={1.1}>
                {floatingDay}
              </RNText>
            </View>
          </Animated.View>
        ) : null}

        {farFromBottom ? (
          <Animated.View
            entering={ZoomIn.duration(180)}
            exiting={ZoomOut.duration(140)}
            layout={LinearTransition}
            style={[styles.jumpWrap, { bottom: bottomInset + 12 }]}
          >
            <Pressable
              onPress={() => {
                void haptic('light');
                scrollToBottom(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('chat.jumpToLatest', {
                defaultValue: 'Jump to latest',
              })}
              style={({ pressed }) => [styles.jump, pressed && styles.jumpPressed]}
            >
              <ChevronDown size={20} color={COLORS.black} strokeWidth={2.5} />
              {unseenCount > 0 ? (
                <View style={styles.badge}>
                  <RNText style={styles.badgeText} maxFontSizeMultiplier={1.0}>
                    {unseenCount > 99 ? '99+' : unseenCount}
                  </RNText>
                </View>
              ) : null}
            </Pressable>
          </Animated.View>
        ) : null}
        <RNText style={styles.srOnly} accessibilityElementsHidden>
          {participantName}
        </RNText>
      </View>
    );
  }
);

/** The other side is typing: three dots that rise one after another. */
function TypingBubble() {
  return (
    <View style={styles.typingBubble}>
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          entering={FadeIn.delay(i * 120)}
          style={styles.typingDot}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  unreadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  unreadLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  unreadText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontFamily: 'Archivo_600SemiBold',
  },
  dayRow: { alignItems: 'center', marginVertical: 10 },
  dayPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  dayText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontFamily: 'Archivo_600SemiBold',
  },
  floatingDay: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  typingRow: { paddingHorizontal: 10, marginBottom: 10, alignItems: 'flex-start' },
  typingBubble: {
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: '#262626',
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  loadingRow: { alignItems: 'center', paddingVertical: 12 },
  loadingText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontFamily: 'Archivo_400Regular',
  },
  jumpWrap: { position: 'absolute', right: 14 },
  jump: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jumpPressed: { opacity: 0.7 },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: COLORS.black,
    borderWidth: 1.5,
    borderColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: COLORS.white, fontSize: 10, fontFamily: 'Archivo_700Bold' },
  srOnly: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
