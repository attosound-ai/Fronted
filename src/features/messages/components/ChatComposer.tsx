/**
 * ChatComposer — the message input of ChatScreen.
 *
 * Deliberately UNCONTROLLED (no `value` prop). The previous composer fed the
 * JS state back into the native field on every render. On iOS that is what
 * let the native text and the JS value drift apart (dictation into a
 * multiline input, autocorrect candidates, a reset while the keyboard was
 * mid edit) and ended in the fatal NSRangeException captured by Sentry
 * (issue 7725202984): the keyboard asked React Native to edit a range the
 * field no longer had.
 *
 * Here the native field owns the text. JS only mirrors it (`draftRef`) to
 * know whether Send is enabled and to hand the content to `onSend`.
 * Programmatic changes go through native commands (`clear()`) or a full
 * remount of the field (`generation`), never through a `value` prop.
 *
 * The draft lives in a ref owned by the parent so it survives GiftedChat
 * remounting the input toolbar (reply / edit banners toggling).
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { SendHorizontal } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { COLORS } from '@/constants/theme';
import { haptic } from '@/lib/haptics/hapticService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';

export interface ChatComposerHandle {
  /** Empty the field through the native command (keyboard stays up). */
  clear: () => void;
  focus: () => void;
}

interface ChatComposerProps {
  conversationId: string;
  /** Owned by the parent: the current text, kept across toolbar remounts. */
  draftRef: React.MutableRefObject<string>;
  /**
   * Bump to remount the native field with `draftRef.current` as its content
   * (entering edit mode). A remount is the only fully deterministic way to
   * replace text on the New Architecture; `setNativeProps({ text })` is not.
   */
  generation: number;
  /** Focus the field after a `generation` remount. */
  focusOnGeneration?: boolean;
  placeholder: string;
  onSend: (text: string) => void;
  /** Every keystroke, with the full text (drives the typing indicator). */
  onTextActivity?: (text: string) => void;
}

/** Field height bounds in points: one line, and about six lines. */
const MIN_FIELD_HEIGHT = 34;
const MAX_FIELD_HEIGHT = 120;

export const ChatComposer = forwardRef<ChatComposerHandle, ChatComposerProps>(
  function ChatComposer(
    {
      conversationId,
      draftRef,
      generation,
      focusOnGeneration = false,
      placeholder,
      onSend,
      onTextActivity,
    },
    ref
  ) {
    const { t } = useTranslation('messages');
    const inputRef = useRef<TextInput>(null);
    const [hasText, setHasText] = useState(() => draftRef.current.trim().length > 0);

    // A remount replaces the native field: give the keyboard one frame to
    // attach to the new view before focusing it.
    const isFirstGeneration = useRef(true);
    useEffect(() => {
      if (isFirstGeneration.current) {
        isFirstGeneration.current = false;
        return;
      }
      setHasText(draftRef.current.trim().length > 0);
      if (!focusOnGeneration) return;
      const frame = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(frame);
      // draftRef is a stable ref; only the generation matters here.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [generation]);

    const clear = useCallback(() => {
      draftRef.current = '';
      setHasText(false);
      inputRef.current?.clear();
    }, [draftRef]);

    useImperativeHandle(
      ref,
      () => ({
        clear,
        focus: () => inputRef.current?.focus(),
      }),
      [clear]
    );

    // The send button pops in with the first character and out with the last
    // (Telegram, iMessage): scale plus a short spin, on the UI thread.
    const sendPop = useSharedValue(hasText ? 1 : 0);
    useEffect(() => {
      sendPop.value = withSpring(hasText ? 1 : 0, {
        damping: 14,
        stiffness: 260,
        mass: 0.6,
      });
    }, [hasText, sendPop]);
    const sendStyle = useAnimatedStyle(() => ({
      transform: [
        { scale: 0.7 + 0.3 * sendPop.value },
        { rotate: `${-60 + 60 * sendPop.value}deg` },
      ],
      opacity: 0.55 + 0.45 * sendPop.value,
    }));

    // The field grows one line at a time with a spring, never in a jump.
    const fieldHeight = useSharedValue(0);
    const fieldStyle = useAnimatedStyle(() =>
      fieldHeight.value > 0 ? { height: fieldHeight.value } : {}
    );
    const onContentSizeChange = useCallback(
      (e: { nativeEvent: { contentSize: { height: number } } }) => {
        const next = Math.min(
          MAX_FIELD_HEIGHT,
          Math.max(MIN_FIELD_HEIGHT, Math.ceil(e.nativeEvent.contentSize.height))
        );
        if (Math.abs(next - fieldHeight.value) < 1) return;
        fieldHeight.value =
          fieldHeight.value === 0
            ? next
            : withSpring(next, {
                damping: 24,
                stiffness: 400,
                mass: 0.5,
                overshootClamping: true,
              });
      },
      [fieldHeight]
    );

    const handleChangeText = useCallback(
      (value: string) => {
        draftRef.current = value;
        const next = value.trim().length > 0;
        setHasText((prev) => (prev === next ? prev : next));
        onTextActivity?.(value);
      },
      [draftRef, onTextActivity]
    );

    const handleSend = useCallback(() => {
      const content = draftRef.current.trim();
      if (!content) {
        // The button is visually idle, but a tap here is a signal that the
        // user sees text the app does not (the old desync symptom).
        analytics.capture(ANALYTICS_EVENTS.MESSAGES.SEND_PRESSED_EMPTY, {
          conversation_id: conversationId,
        });
        return;
      }
      haptic('light');
      onSend(content);
      clear();
    }, [clear, conversationId, draftRef, onSend]);

    return (
      <View style={styles.row}>
        <Animated.View style={[styles.inputWrapper, fieldStyle]}>
          <TextInput
            key={generation}
            onContentSizeChange={onContentSizeChange}
            ref={inputRef}
            defaultValue={draftRef.current}
            onChangeText={handleChangeText}
            placeholder={placeholder}
            placeholderTextColor={COLORS.gray[500]}
            multiline
            style={styles.input}
            keyboardAppearance="dark"
            autoCapitalize="sentences"
            maxFontSizeMultiplier={1.0}
            textAlignVertical="center"
            underlineColorAndroid="transparent"
            accessibilityLabel={t('chat.inputAccessibilityLabel')}
          />
        </Animated.View>
        <Animated.View style={sendStyle}>
          <Pressable
            onPress={handleSend}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('chat.sendAccessibilityLabel')}
            accessibilityState={{ disabled: !hasText }}
            style={({ pressed }) => [
              styles.sendButton,
              !hasText && styles.sendButtonIdle,
              pressed && hasText && styles.sendButtonPressed,
            ]}
          >
            <SendHorizontal
              size={16}
              color={hasText ? '#000' : '#888'}
              strokeWidth={2.5}
            />
          </Pressable>
        </Animated.View>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flex: 1,
    gap: 6,
  },
  inputWrapper: {
    flex: 1,
    justifyContent: 'center',
  },
  input: {
    backgroundColor: 'transparent',
    paddingHorizontal: 14,
    // iOS multiline fields sit their text at the top of the box; with the
    // box exactly one line tall plus symmetric padding, the placeholder and
    // the first line land centred. Keep MIN_FIELD_HEIGHT in step.
    paddingTop: 7,
    paddingBottom: 7,
    color: COLORS.white,
    fontFamily: 'Archivo_400Regular',
    fontSize: 15,
    lineHeight: 20,
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  sendButtonIdle: {
    backgroundColor: '#444',
  },
  sendButtonPressed: {
    opacity: 0.7,
  },
});
