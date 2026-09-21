import { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { ArrowUpLeft, Clock, AlertCircle, MessageSquare } from 'lucide-react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';
import { GOLD } from '@/constants/gold';

import { haptic } from '@/lib/haptics/hapticService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { COLORS } from '@/constants/theme';
import type { AttoMessage } from '../utils/messageAdapter';
import { ReactionBar } from '../components/ReactionBar';
import {
  bubbleCorners,
  emojiOnlyCount,
  emojiOnlySize,
  replySwipeTranslation,
  replySwipeTrigger,
  type GroupPosition,
} from './threadModel';
import { hasMarkdown, parseMarkdown } from './markdown';
import { isMediaContentType, isVisualContentType } from '../media/chatMedia';

// The native iOS context menu (UIContextMenuInteraction): preview, blur and
// haptic come from the system. Absent on other platforms.
const ContextMenuView =
  Platform.OS === 'ios'
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('react-native-ios-context-menu').ContextMenuView as React.ComponentType<
        Record<string, unknown>
      >)
    : null;

export interface MenuItem {
  actionKey: string;
  actionTitle: string;
  icon?: { type: 'IMAGE_SYSTEM'; imageValue: { systemName: string } };
  menuAttributes?: string[];
}

export interface MessageRowProps {
  message: AttoMessage;
  isOwn: boolean;
  position: GroupPosition;
  currentUserId: string;
  /** Slide in from the composer: only the message just sent from this device. */
  justSent: boolean;
  /** The author is a creator: the bubble wears the creator gold, whichever side it is on. */
  senderIsCreator: boolean;
  menuItems: MenuItem[];
  labels: {
    you: string;
    deleted: string;
    edited: string;
    /** "3 replies", for the thread footer. */
    replies: (count: number) => string;
  };
  onMenuAction: (actionKey: string, message: AttoMessage) => void;
  onReply: (message: AttoMessage) => void;
  /** Double tap or the React menu item: the bubble's window rect comes along for the Tapback pill. */
  onDoubleTap: (
    message: AttoMessage,
    rect: { x: number; y: number; width: number; height: number }
  ) => void;
  /** Reply mode (iMessage): everything but the message being answered dims. */
  dimmed: boolean;
  /** 0..1 shared with every row: how far the list is dragged to reveal times. */
  timesReveal: SharedValue<number>;
  /** Called on the JS side when a left drag revealed the times (telemetry). */
  onTimesRevealed?: () => void;
  /** "Read 12:17 AM" under this bubble (only the newest own message the other side read). */
  readLabel: string | null;
  /** Slack style thread footer under the bubble. */
  threadReplies?: number;
  onOpenThread?: (messageId: string) => void;
  onToggleReaction: (message: AttoMessage, emoji: string) => void;
  onPressQuote?: (replyToId: string) => void;
  renderMedia?: (message: AttoMessage) => React.ReactNode;
}

// Quick and crisp, no visible overshoot: the reference apps settle in about
// 200 to 250 ms. A soft spring here read as slow and bouncy.
/** Rubber banded translation while swiping to reply. Same rule as threadModel, on the UI thread. */

/** Tail geometry: 24 pt of the width sit under the bubble, 8 pt curl past its edge. */
// iMessage geometry, measured on a real sent bubble at 3x: the tail hangs
// this far below the bubble's bottom edge (see BubbleShape).
const TAIL_DROP = 8;
// The reaction pill hangs from the bottom edge on the inner side (the tail
// owns the outer corner), overlapping the bubble by a few points so it never
// covers the time or the ticks.
const REACTION_OVERLAP = 6;
const REACTION_HANG = 20;
const GOLD_STOPS = [GOLD.highlight, GOLD.bright, GOLD.base, GOLD.rich] as const;
const GOLD_LOCATIONS = [0, 0.35, 0.7, 1] as const;

const SPRING = { damping: 26, stiffness: 420, mass: 0.6, overshootClamping: true };
const SETTLE_MS = 220;
/** How far bubbles slide left while dragging to reveal the times (iMessage). */
const TIMES_REVEAL_PX = 64;
const EASE_OUT = Easing.out(Easing.cubic);

function formatTime(date: Date | number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(date));
}

/**
 * One message in the thread, drawn the way the reference apps draw theirs:
 * a run of bubbles from one author shares its corners, a swipe to the right
 * replies (rubber banded, haptic at the trigger), a double tap reacts, the
 * native long press menu previews the bubble, a solo emoji is drawn big with
 * no bubble, and a new message settles in with a spring while the ones above
 * make room.
 */
function MessageRowInner({
  message,
  isOwn,
  position,
  currentUserId,
  justSent,
  senderIsCreator,
  menuItems,
  labels,
  onMenuAction,
  onReply,
  onDoubleTap,
  onToggleReaction,
  onPressQuote,
  renderMedia,
  dimmed,
  timesReveal,
  onTimesRevealed,
  readLabel,
  threadReplies = 0,
  onOpenThread,
}: MessageRowProps) {
  const bubbleRef = useRef<View>(null);
  // Bubble size, only tracked for creator bubbles: the tail continues the
  // gold gradient, and the gradient runs across the whole bubble.
  const [bubbleSize, setBubbleSize] = useState<{ w: number; h: number } | null>(null);
  const onBubbleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      setBubbleSize((prev) =>
        prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }
      );
    },
    [senderIsCreator]
  );
  const drag = useSharedValue(0);
  const armed = useSharedValue(false);
  const buzzed = useSharedValue(false);

  const fireReply = useCallback(() => onReply(message), [onReply, message]);
  const requestTapback = useCallback(
    (gesture: string) => {
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.BUBBLE_GESTURE, {
        gesture,
        message_id: message._id,
      });
      const node = bubbleRef.current;
      if (!node) return;
      node.measureInWindow((x, y, width, height) =>
        onDoubleTap(message, { x, y, width, height })
      );
    },
    [onDoubleTap, message]
  );
  const fireDoubleTap = useCallback(() => requestTapback('double_tap'), [requestTapback]);
  const buzz = useCallback((kind: 'light' | 'medium' | 'heavy') => void haptic(kind), []);

  const reportTimes = useCallback(() => onTimesRevealed?.(), [onTimesRevealed]);
  // One pan, two directions: right swipes this bubble out to reply, left
  // drags the whole thread to reveal the times (iMessage). Vertical intent
  // fails fast so the list keeps scrolling.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-18, 12])
        .failOffsetY([-14, 14])
        .onUpdate((e) => {
          if (e.translationX >= 0) {
            timesReveal.value = 0;
            const trigger = replySwipeTrigger(isOwn);
            drag.value = replySwipeTranslation(e.translationX, trigger);
            const nowArmed = e.translationX >= trigger;
            if (nowArmed !== armed.value) {
              armed.value = nowArmed;
              // Telegram: one heavy tap the first time the threshold is
              // reached; crossing back and forth does not repeat it.
              if (nowArmed && !buzzed.value) {
                buzzed.value = true;
                runOnJS(buzz)('heavy');
              }
            }
          } else {
            drag.value = 0;
            armed.value = false;
            timesReveal.value = Math.min(1, -e.translationX / 90);
          }
        })
        .onEnd(() => {
          // Decided on release (Telegram): crossing the threshold and coming
          // back before lifting the finger sends nothing.
          if (armed.value) runOnJS(fireReply)();
          buzzed.value = false;
          if (timesReveal.value > 0.5) runOnJS(reportTimes)();
          armed.value = false;
          drag.value = withSpring(0, SPRING);
          timesReveal.value = withSpring(0, SPRING);
        })
        .onFinalize(() => {
          drag.value = withSpring(0, SPRING);
          timesReveal.value = withSpring(0, SPRING);
        }),
    [drag, armed, buzzed, isOwn, timesReveal, buzz, fireReply, reportTimes]
  );

  const doubleTap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .maxDelay(280)
        .onEnd(() => {
          runOnJS(buzz)('light');
          runOnJS(fireDoubleTap)();
        }),
    [buzz, fireDoubleTap]
  );

  const gesture = useMemo(() => Gesture.Simultaneous(pan, doubleTap), [pan, doubleTap]);

  const slide = useAnimatedStyle(() => ({
    transform: [{ translateX: drag.value - timesReveal.value * TIMES_REVEAL_PX }],
  }));
  const timeReveal = useAnimatedStyle(() => ({
    opacity: timesReveal.value,
    transform: [{ translateX: (1 - timesReveal.value) * 30 }],
  }));
  const dimStyle = useAnimatedStyle(() => ({
    opacity: withTiming(dimmed ? 0.3 : 1, { duration: 180 }),
  }));
  const replyHint = useAnimatedStyle(() => {
    const p = Math.min(1, drag.value / replySwipeTrigger(isOwn));
    return {
      opacity: p,
      transform: [{ scale: 0.6 + 0.4 * p }, { translateX: -40 + 40 * p }],
    };
  });

  const emojiCount = message.isDeleted ? 0 : emojiOnlyCount(message.text ?? '');
  const corners = bubbleCorners(isOwn, position);
  const tailed =
    position.last && !message.isDeleted && emojiOnlyCount(message.text ?? '') === 0;
  const cornerStyle = {
    borderTopLeftRadius: corners.topLeft,
    borderTopRightRadius: corners.topRight,
    borderBottomLeftRadius: corners.bottomLeft,
    borderBottomRightRadius: corners.bottomRight,
  };
  const hasReactions = !!message.reactions && message.reactions.length > 0;

  const isMedia = isMediaContentType(message.contentType);
  const isVisual = isVisualContentType(message.contentType);
  // Width the floating time needs on the last text line: the meta text plus
  // room for the ticks (about three figure spaces at 11 pt).
  const metaSpacer =
    '\u2007' +
    (message.isEdited ? `${labels.edited} ` : '') +
    formatTime(message.createdAt) +
    (isOwn ? '\u2007\u2007\u2007' : '');

  const bubble = message.isDeleted ? (
    <View style={[styles.bubble, styles.bubbleDeleted, cornerStyle]}>
      <RNText style={styles.deletedText} maxFontSizeMultiplier={1.1}>
        {labels.deleted}
      </RNText>
    </View>
  ) : emojiCount > 0 ? (
    <View style={styles.emojiOnly}>
      <RNText
        style={[
          styles.emojiText,
          {
            fontSize: emojiOnlySize(emojiCount),
            lineHeight: emojiOnlySize(emojiCount) + 10,
          },
        ]}
        maxFontSizeMultiplier={1.0}
      >
        {message.text.trim()}
      </RNText>
      <RNText style={styles.emojiTime} maxFontSizeMultiplier={1.0}>
        {formatTime(message.createdAt)}
      </RNText>
    </View>
  ) : (
    <View style={[styles.bubble, isVisual && styles.bubbleVisual]}>
      {/* Bubble and tail are ONE vector shape with one fill, so no seam can
          appear where the tail meets the corner (a separate tail svg left a
          visible line on the phone). */}
      <BubbleShape
        size={bubbleSize}
        corners={corners}
        tail={tailed ? (isOwn ? 'right' : 'left') : null}
        fill={senderIsCreator ? 'gold' : isOwn ? COLORS.white : '#262626'}
      />
      {message.replyToId && message.replyToContent ? (
        <View
          style={[
            styles.quote,
            isOwn || senderIsCreator ? styles.quoteOwn : styles.quoteOther,
          ]}
          onTouchEnd={() => onPressQuote?.(message.replyToId as string)}
        >
          <View
            style={[
              styles.quoteBar,
              isOwn || senderIsCreator ? styles.quoteBarOwn : styles.quoteBarOther,
            ]}
          />
          <View style={styles.quoteBody}>
            <RNText
              style={[
                styles.quoteName,
                (isOwn || senderIsCreator) && styles.quoteNameOwn,
              ]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.1}
            >
              {message.replyToSender || labels.you}
            </RNText>
            <RNText
              style={[
                styles.quoteText,
                (isOwn || senderIsCreator) && styles.quoteTextOwn,
              ]}
              numberOfLines={2}
              maxFontSizeMultiplier={1.1}
            >
              {message.replyToContent}
            </RNText>
          </View>
        </View>
      ) : null}
      {renderMedia?.(message)}
      {message.text && !isMedia ? (
        <RNText
          style={[styles.text, (isOwn || senderIsCreator) && styles.textOwn]}
          maxFontSizeMultiplier={1.2}
          selectable={false}
        >
          {hasMarkdown(message.text)
            ? parseMarkdown(message.text).map((span, i) => (
                <RNText
                  key={i}
                  style={[
                    span.bold && styles.spanBold,
                    span.italic && styles.spanItalic,
                    span.strike && styles.spanStrike,
                    span.code && styles.spanCode,
                    span.code && (isOwn || senderIsCreator) && styles.spanCodeOwn,
                  ]}
                >
                  {span.text}
                </RNText>
              ))
            : message.text}
          {/* Invisible copy of the meta so the last line reserves its width:
              the time floats into that gap when it fits, or the spacer wraps
              and the time takes the new line (WhatsApp and Telegram). */}
          <RNText style={styles.metaSpacer} maxFontSizeMultiplier={1.0}>
            {metaSpacer}
          </RNText>
        </RNText>
      ) : null}
      <View
        style={[
          styles.meta,
          message.text && !isMedia ? styles.metaFloating : null,
          isVisual ? styles.metaOverMedia : null,
        ]}
      >
        {message.isEdited ? (
          <RNText
            style={[styles.edited, (isOwn || senderIsCreator) && styles.metaOwn]}
            maxFontSizeMultiplier={1.0}
          >
            {labels.edited}
          </RNText>
        ) : null}
        <RNText
          style={[styles.time, (isOwn || senderIsCreator) && styles.metaOwn]}
          maxFontSizeMultiplier={1.0}
        >
          {formatTime(message.createdAt)}
        </RNText>
        {isOwn ? <Ticks message={message} /> : null}
      </View>
    </View>
  );

  const content = (
    <View style={[styles.stack, isOwn ? styles.stackOwn : styles.stackOther]}>
      <View
        style={styles.bubbleWrap}
        ref={bubbleRef}
        collapsable={false}
        onLayout={onBubbleLayout}
      >
        {bubble}
        {hasReactions ? (
          <View
            style={[
              styles.reactions,
              isOwn ? styles.reactionsOwn : styles.reactionsOther,
            ]}
          >
            <ReactionBar
              reactions={message.reactions}
              currentUserId={currentUserId}
              onToggle={(emoji) => onToggleReaction(message, emoji)}
              compact
            />
          </View>
        ) : null}
      </View>
      {hasReactions ? <View style={styles.reactionsSpace} /> : null}
      {threadReplies > 0 ? (
        <Pressable
          onPress={() => onOpenThread?.(String(message._id))}
          style={styles.threadFooter}
          accessibilityRole="button"
          accessibilityLabel={labels.replies(threadReplies)}
        >
          <MessageSquare size={13} color="rgba(255,255,255,0.7)" strokeWidth={2.25} />
          <RNText style={styles.threadFooterText} maxFontSizeMultiplier={1.1}>
            {labels.replies(threadReplies)}
          </RNText>
        </Pressable>
      ) : null}
      {readLabel ? (
        <Animated.Text
          entering={FadeIn.duration(220)}
          style={[styles.readLabel, hasReactions && styles.readLabelAfterReactions]}
          maxFontSizeMultiplier={1.0}
        >
          {readLabel}
        </Animated.Text>
      ) : null}
    </View>
  );

  const withMenu =
    ContextMenuView && !message.isDeleted ? (
      <ContextMenuView
        menuConfig={{ menuTitle: '', menuItems }}
        shouldWaitForMenuToHide={false}
        onMenuWillShow={() => {
          void haptic('heavy');
          analytics.capture(ANALYTICS_EVENTS.MESSAGES.BUBBLE_GESTURE, {
            gesture: 'long_press_menu',
            message_id: message._id,
          });
        }}
        onPressMenuItem={({ nativeEvent }: { nativeEvent: { actionKey: string } }) => {
          if (nativeEvent.actionKey === 'react') {
            // The native menu is still animating out: measure once it is gone.
            setTimeout(() => requestTapback('menu_react'), 260);
            return;
          }
          onMenuAction(nativeEvent.actionKey, message);
        }}
      >
        {content}
      </ContextMenuView>
    ) : (
      content
    );

  return (
    <Animated.View
      entering={justSent ? undefined : FadeInDown.duration(SETTLE_MS).easing(EASE_OUT)}
      exiting={FadeOut.duration(140)}
      layout={LinearTransition.duration(SETTLE_MS).easing(EASE_OUT)}
      style={[
        styles.row,
        isOwn ? styles.rowOwn : styles.rowOther,
        position.last ? styles.rowGroupEnd : styles.rowGroupInner,
        dimStyle,
      ]}
    >
      <Animated.View style={[styles.revealTime, timeReveal]} pointerEvents="none">
        <RNText style={styles.revealTimeText} maxFontSizeMultiplier={1.0}>
          {formatTime(message.createdAt)}
        </RNText>
      </Animated.View>
      <Animated.View style={[styles.replyHint, replyHint]} pointerEvents="none">
        <ArrowUpLeft size={16} color={COLORS.white} strokeWidth={2.5} />
      </Animated.View>
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[styles.slide, isOwn ? styles.slideOwn : styles.slideOther, slide]}
        >
          {withMenu}
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

/**
 * The bubble background: a rounded rectangle with the run's corner radii and,
 * on the last bubble of a run, iMessage's tail hanging under the outer bottom
 * corner (measured on a real sent bubble at 3x: 8 pt drop, point 9 pt inside
 * the edge, inner side sweeping back to the bottom 21 pt in). One path, one
 * fill (solid or the creator gradient), so bubble and tail are one surface.
 */
function BubbleShape({
  size,
  corners,
  tail,
  fill,
}: {
  size: { w: number; h: number } | null;
  corners: { topLeft: number; topRight: number; bottomLeft: number; bottomRight: number };
  tail: 'left' | 'right' | null;
  fill: 'gold' | string;
}) {
  if (!size) return null;
  const { w, h } = size;
  const tl = Math.min(corners.topLeft, w / 2, h / 2);
  const tr = Math.min(corners.topRight, w / 2, h / 2);
  const br = Math.min(corners.bottomRight, w / 2, h / 2);
  const bl = Math.min(corners.bottomLeft, w / 2, h / 2);
  const d = [
    `M${tl} 0`,
    `H${w - tr}`,
    `A${tr} ${tr} 0 0 1 ${w} ${tr}`,
    `V${h - br}`,
    `A${br} ${br} 0 0 1 ${w - br} ${h}`,
    `H${bl}`,
    `A${bl} ${bl} 0 0 1 0 ${h - bl}`,
    `V${tl}`,
    `A${tl} ${tl} 0 0 1 ${tl} 0`,
    'Z',
  ];
  if (tail === 'right') {
    // Starts on the corner arc and returns along the bottom edge.
    d.push(
      `M${w - 19} ${h - 0.5}`,
      `L${w - br} ${h}`,
      `A${br} ${br} 0 0 0 ${w - 11.3} ${h - 1.3}`,
      `Q${w - 9.5} ${h + 4} ${w - 9} ${h + TAIL_DROP - 0.5}`,
      `Q${w - 19} ${h + 3.25} ${w - 21} ${h}`,
      'Z'
    );
  } else if (tail === 'left') {
    d.push(
      `M19 ${h - 0.5}`,
      `L${bl} ${h}`,
      `A${bl} ${bl} 0 0 1 11.3 ${h - 1.3}`,
      `Q9.5 ${h + 4} 9 ${h + TAIL_DROP - 0.5}`,
      `Q19 ${h + 3.25} 21 ${h}`,
      'Z'
    );
  }
  return (
    <Svg
      width={w}
      height={h + TAIL_DROP}
      viewBox={`0 0 ${w} ${h + TAIL_DROP}`}
      style={styles.shape}
      pointerEvents="none"
    >
      {fill === 'gold' ? (
        <Defs>
          <SvgGradient
            id="bubbleGold"
            gradientUnits="userSpaceOnUse"
            x1={0}
            y1={0}
            x2={w}
            y2={h}
          >
            {GOLD_STOPS.map((c, i) => (
              <Stop key={c} offset={GOLD_LOCATIONS[i]} stopColor={c} />
            ))}
          </SvgGradient>
        </Defs>
      ) : null}
      <Path
        d={d.join(' ')}
        fill={fill === 'gold' ? 'url(#bubbleGold)' : fill}
        fillRule="nonzero"
      />
    </Svg>
  );
}

function Ticks({ message }: { message: AttoMessage }) {
  if (message.status === 'failed') {
    return <AlertCircle size={13} color="#B91C1C" strokeWidth={2.25} />;
  }
  if (message.pending || message.status === 'sending') {
    return <Clock size={12} color="rgba(0,0,0,0.4)" strokeWidth={2.25} />;
  }
  if (message.received) {
    return <TickMarks double color="rgba(0,0,0,0.75)" />;
  }
  return <TickMarks double={false} color="rgba(0,0,0,0.4)" />;
}

/**
 * WhatsApp's ticks: two identical check marks, the second shifted right by a
 * fixed offset, thin round strokes. lucide's CheckCheck clips the second
 * mark, which read as two different sizes.
 */
function TickMarks({ double, color }: { double: boolean; color: string }) {
  const width = double ? 17 : 12;
  return (
    <Svg width={width} height={11} viewBox={`0 0 ${width} 11`}>
      <Path
        d="M1.2 6.2 L4.4 9.3 L10.6 2.2"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {double ? (
        <Path
          d="M6.4 6.2 L9.6 9.3 L15.8 2.2"
          stroke={color}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ) : null}
    </Svg>
  );
}

/**
 * Slide the freshly sent bubble in from the composer: a short ease out with
 * no spring. A bouncy version was rejected on the phone as slow and ugly.
 */
export const sentFromComposer = FadeInDown.duration(220)
  .easing(EASE_OUT)
  .withInitialValues({
    transform: [{ translateY: 44 }, { scale: 0.96 }],
    opacity: 0,
  });

export const MessageRow = memo(MessageRowInner, (a, b) => {
  return (
    a.message === b.message &&
    a.isOwn === b.isOwn &&
    a.position.first === b.position.first &&
    a.position.last === b.position.last &&
    a.justSent === b.justSent &&
    a.senderIsCreator === b.senderIsCreator &&
    a.dimmed === b.dimmed &&
    a.onTimesRevealed === b.onTimesRevealed &&
    a.readLabel === b.readLabel &&
    a.menuItems === b.menuItems &&
    a.labels === b.labels
  );
});

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  rowOwn: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  rowGroupInner: { marginBottom: 2 },
  rowGroupEnd: { marginBottom: 10 },
  replyHint: {
    position: 'absolute',
    left: 12,
    bottom: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slide: { maxWidth: '82%' },
  slideOwn: { alignItems: 'flex-end' },
  slideOther: { alignItems: 'flex-start' },
  stack: {},
  bubbleWrap: { position: 'relative' },
  revealTime: {
    position: 'absolute',
    right: -TIMES_REVEAL_PX + 8,
    bottom: 8,
    width: TIMES_REVEAL_PX - 8,
  },
  revealTimeText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontFamily: 'Archivo_400Regular',
    textAlign: 'left',
  },
  stackOwn: { alignItems: 'flex-end' },
  stackOther: { alignItems: 'flex-start' },
  bubble: {
    paddingHorizontal: 12,
    paddingTop: 7,
    paddingBottom: 5,
    minWidth: 60,
    backgroundColor: 'transparent',
  },
  shape: { position: 'absolute', left: 0, top: 0 },
  bubbleDeleted: { backgroundColor: 'rgba(255,255,255,0.08)' },
  deletedText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontStyle: 'italic',
    fontFamily: 'Archivo_400Regular',
  },
  text: {
    color: COLORS.white,
    fontSize: 16,
    lineHeight: 21,
    fontFamily: 'Archivo_400Regular',
  },
  textOwn: { color: COLORS.black },
  spanBold: { fontFamily: 'Archivo_700Bold' },
  // iOS does not synthesise italics for a custom family: use the real face.
  spanItalic: { fontFamily: 'Archivo_400Regular_Italic' },
  spanStrike: { textDecorationLine: 'line-through' },
  spanCode: {
    fontFamily: 'Menlo',
    fontSize: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  spanCodeOwn: { backgroundColor: 'rgba(0,0,0,0.1)' },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
    marginTop: 2,
  },
  bubbleVisual: { paddingHorizontal: 3, paddingTop: 3, paddingBottom: 3, minWidth: 0 },
  // Time and ticks over a photo or video, WhatsApp style pill.
  metaOverMedia: {
    position: 'absolute',
    right: 9,
    bottom: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 0,
  },
  // Over the spacer at the end of the last text line.
  metaFloating: {
    position: 'absolute',
    right: 12,
    bottom: 6,
    marginTop: 0,
  },
  metaSpacer: {
    color: 'transparent',
    fontSize: 11,
    fontFamily: 'Archivo_400Regular',
  },
  time: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontFamily: 'Archivo_400Regular',
  },
  edited: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontStyle: 'italic',
    fontFamily: 'Archivo_400Regular',
  },
  metaOwn: { color: 'rgba(0,0,0,0.45)' },
  emojiOnly: { alignItems: 'flex-end', paddingHorizontal: 4 },
  emojiText: { color: COLORS.white },
  emojiTime: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    marginTop: 2,
    fontFamily: 'Archivo_400Regular',
  },
  quote: {
    flexDirection: 'row',
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 6,
    marginTop: 2,
  },
  quoteOwn: { backgroundColor: 'rgba(0,0,0,0.08)' },
  quoteOther: { backgroundColor: 'rgba(255,255,255,0.08)' },
  quoteBar: { width: 3 },
  quoteBarOwn: { backgroundColor: 'rgba(0,0,0,0.55)' },
  quoteBarOther: { backgroundColor: 'rgba(255,255,255,0.7)' },
  quoteBody: { paddingHorizontal: 8, paddingVertical: 5, flexShrink: 1 },
  quoteName: {
    color: COLORS.white,
    fontSize: 12,
    fontFamily: 'Archivo_600SemiBold',
  },
  quoteNameOwn: { color: COLORS.black },
  quoteText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontFamily: 'Archivo_400Regular',
  },
  quoteTextOwn: { color: 'rgba(0,0,0,0.55)' },
  readLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontFamily: 'Archivo_600SemiBold',
    marginTop: TAIL_DROP + 2,
    marginRight: 4,
  },
  threadFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: TAIL_DROP + 2,
    paddingHorizontal: 6,
  },
  threadFooterText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontFamily: 'Archivo_600SemiBold',
  },
  // The reaction spacer already clears the tail.
  readLabelAfterReactions: { marginTop: 2 },
  // Hangs from the bubble's bottom edge on the inner side, like Telegram's
  // own message reactions; the spacer keeps the next row clear of it.
  reactions: { position: 'absolute', bottom: -REACTION_HANG, zIndex: 2 },
  reactionsOwn: { left: 8 },
  reactionsOther: { right: 8 },
  reactionsSpace: { height: REACTION_HANG - REACTION_OVERLAP + 2 },
});
