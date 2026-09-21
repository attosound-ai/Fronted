/**
 * Chat composer, Telegram's layout on iOS 26 with the system's Liquid Glass:
 *
 *   [ + ]  ( field .................. emoji | send )  ( mic )
 *
 * The "+" and the mic are glass circles outside the capsule; the field, the
 * reply or edit preview, the emoji button and the send button live inside the
 * glass capsule. Empty field: no send, the mic shows. First character (as
 * measured on Telegram, about 220 ms): the send button grows from a dot at
 * the capsule's right end while the mic slides right and fades; the capsule
 * stretches to take the space. Deleting the last character reverses it in
 * about 175 ms.
 *
 * The native field owns its text (uncontrolled, see `draftRef`): replacing
 * the content deterministically on the New Architecture means a remount.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Maximize2, Mic, Plus, SendHorizontal, Smile } from 'lucide-react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { GlassSurface } from '@/components/navigation/GlassSurface';
import { COLORS } from '@/constants/theme';
import { haptic } from '@/lib/haptics/hapticService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { useComposerExpandStore } from '../stores/composerExpandStore';
import { useAttachSheet } from '../hooks/useAttachSheet';
import { useVoiceNote } from '../media/useVoiceNote';
import type { OutgoingMedia } from '../media/chatMedia';
import { Trash2 } from 'lucide-react-native';
import { TAPBACK_EMOJI } from '../thread/TapbackOverlay';

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
  /** Reply or edit preview rendered inside the capsule above the field. */
  preview?: ReactNode;
  /** The "+" button: the screen opens the attach menu (iMessage style). */
  onAttachPress?: () => void;
  /** A recorded voice note ready to send. */
  onSendMedia?: (media: OutgoingMedia) => void;
}

/** Field height bounds in points: one line, and about six lines. */
const MIN_FIELD_HEIGHT = 36;
const MAX_FIELD_HEIGHT = 120;
/** Telegram: send grows in over about 220 ms, shrinks out in about 175 ms. */
const SEND_IN_MS = 220;
const SEND_OUT_MS = 175;
const EASE_OUT = Easing.out(Easing.cubic);
const EASE_IN = Easing.in(Easing.cubic);
const QUICK_EMOJI = [...TAPBACK_EMOJI, '🔥', '🙏', '🎵', '👏', '😍', '🎤'];

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

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
      preview,
      onAttachPress,
      onSendMedia,
    },
    ref
  ) {
    const { t } = useTranslation('messages');
    const inputRef = useRef<TextInput>(null);
    const [hasText, setHasText] = useState(() => draftRef.current.trim().length > 0);
    // Two or more lines: Telegram shows an expand button at the top right of
    // the field that opens the full screen editor.
    const [tall, setTall] = useState(false);
    const [emojiOpen, setEmojiOpen] = useState(false);
    // The editor hands its text back through the store; replacing the field
    // content deterministically means a remount (see `generation`).
    const [localGeneration, setLocalGeneration] = useState(0);
    const expandResult = useComposerExpandStore((s) => s.result);
    const consumeExpand = useComposerExpandStore((s) => s.consume);

    const replaceText = useCallback(
      (text: string, focus: boolean) => {
        draftRef.current = text;
        setHasText(text.trim().length > 0);
        onTextActivity?.(text);
        setLocalGeneration((g) => g + 1);
        if (focus) {
          requestAnimationFrame(() => inputRef.current?.focus());
        }
      },
      [draftRef, onTextActivity]
    );

    useEffect(() => {
      if (!expandResult || expandResult.conversationId !== conversationId) return;
      consumeExpand();
      if (expandResult.action === 'send') {
        const content = expandResult.text.trim();
        replaceText('', false);
        if (content) {
          haptic('light');
          onSend(content);
        }
        return;
      }
      replaceText(expandResult.text, false);
    }, [expandResult, conversationId, consumeExpand, onSend, replaceText]);

    const openExpanded = useCallback(() => {
      haptic('selection');
      useComposerExpandStore.getState().open(conversationId, draftRef.current);
      router.push('/composer-expanded');
    }, [conversationId, draftRef]);

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

    // Send grows from a dot inside the capsule; the mic slides out to the
    // right and fades. Both driven by one progress value, on the UI thread.
    const sendIn = useSharedValue(hasText ? 1 : 0);
    useEffect(() => {
      sendIn.value = withTiming(hasText ? 1 : 0, {
        duration: hasText ? SEND_IN_MS : SEND_OUT_MS,
        easing: hasText ? EASE_OUT : EASE_IN,
      });
    }, [hasText, sendIn]);
    const sendStyle = useAnimatedStyle(() => ({
      transform: [{ scale: 0.1 + 0.9 * sendIn.value }],
      opacity: sendIn.value,
    }));
    const micStyle = useAnimatedStyle(() => ({
      transform: [{ translateX: 40 * sendIn.value }, { scale: 1 - 0.3 * sendIn.value }],
      opacity: 1 - sendIn.value,
    }));

    // On the New Architecture `onContentSizeChange` never fires for this
    // multiline field, so the native view sizes itself (auto grow between
    // MIN and MAX) and the capsule animates the layout change. `onLayout`
    // does fire: it drives the expand button once the field has two lines.
    const onFieldLayout = useCallback(
      (e: { nativeEvent: { layout: { height: number } } }) => {
        setTall(e.nativeEvent.layout.height >= MIN_FIELD_HEIGHT + 18);
      },
      []
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

    const { openAttach } = useAttachSheet(conversationId);

    const toggleEmoji = useCallback(() => {
      haptic('selection');
      setEmojiOpen((open) => {
        analytics.capture(ANALYTICS_EVENTS.MESSAGES.EMOJI_STRIP_TOGGLED, {
          conversation_id: conversationId,
          open: !open,
        });
        return !open;
      });
    }, [conversationId]);
    const insertEmoji = useCallback(
      (emoji: string) => {
        analytics.capture(ANALYTICS_EVENTS.MESSAGES.EMOJI_INSERTED, {
          conversation_id: conversationId,
          emoji,
        });
        replaceText(`${draftRef.current}${emoji}`, true);
      },
      [conversationId, draftRef, replaceText]
    );

    // Press and hold to record (WhatsApp, Telegram): the pan activates on
    // touch down, sliding left past CANCEL_PX throws the note away, lifting
    // the finger sends it. Telemetry covers every outcome.
    const voice = useVoiceNote(conversationId);
    const [cancelArmed, setCancelArmed] = useState(false);
    const startVoice = useCallback(async () => {
      const ok = await voice.start();
      if (!ok) Alert.alert(t('media.permissionMic'));
      else haptic('medium');
    }, [voice, t]);
    const endVoice = useCallback(
      async (cancel: boolean) => {
        setCancelArmed(false);
        const media = cancel ? await voice.cancel() : await voice.stop();
        if (media) {
          haptic('light');
          analytics.capture(ANALYTICS_EVENTS.MESSAGES.VOICE_NOTE_SENT, {
            conversation_id: conversationId,
            duration_ms: media.durationMs ?? null,
            bars: media.waveform?.length ?? 0,
          });
          onSendMedia?.(media);
        }
      },
      [voice, conversationId, onSendMedia]
    );
    // Plain responder events (press in, touch move, press out): a manual
    // activation pan never fired for synthesized touches on the phone.
    const CANCEL_PX = 90;
    const touchStartX = useRef(0);
    const touchLastX = useRef(0);
    const onMicPressIn = useCallback(
      (e: { nativeEvent: { pageX: number } }) => {
        touchStartX.current = e.nativeEvent.pageX;
        touchLastX.current = e.nativeEvent.pageX;
        void startVoice();
      },
      [startVoice]
    );
    const onMicTouchMove = useCallback((e: { nativeEvent: { pageX: number } }) => {
      touchLastX.current = e.nativeEvent.pageX;
      const armed = touchLastX.current < touchStartX.current - CANCEL_PX;
      setCancelArmed((prev) => (prev === armed ? prev : armed));
    }, []);
    const onMicPressOut = useCallback(() => {
      void endVoice(touchLastX.current < touchStartX.current - CANCEL_PX);
    }, [endVoice]);

    return (
      <View style={styles.column}>
        {emojiOpen ? (
          <Animated.View
            entering={FadeIn.duration(160)}
            exiting={FadeOut.duration(120)}
            style={styles.emojiStrip}
          >
            {QUICK_EMOJI.map((emoji) => (
              <Pressable
                key={emoji}
                onPress={() => insertEmoji(emoji)}
                style={styles.emojiChip}
                accessibilityRole="button"
                accessibilityLabel={emoji}
              >
                <Animated.Text style={styles.emojiGlyph}>{emoji}</Animated.Text>
              </Pressable>
            ))}
          </Animated.View>
        ) : null}
        <Animated.View style={styles.row} layout={LinearTransition.duration(SEND_IN_MS)}>
          <GlassSurface radius={22} style={styles.roundButton}>
            <Pressable
              onPress={onAttachPress ?? openAttach}
              style={styles.roundButtonInner}
              accessibilityRole="button"
              accessibilityLabel={t('composer.attach')}
            >
              <Plus size={24} color={COLORS.white} strokeWidth={2.25} />
            </Pressable>
          </GlassSurface>

          <GlassSurface radius={24} style={styles.capsule}>
            {preview}
            {voice.recording ? (
              <Animated.View entering={FadeIn.duration(120)} style={styles.recordingRow}>
                <View style={[styles.recDot, { opacity: 0.5 + 0.5 * voice.level }]} />
                <RNText style={styles.recTime} maxFontSizeMultiplier={1.0}>
                  {formatDuration(voice.durationMs)}
                </RNText>
                <RNText
                  style={[styles.recHint, cancelArmed && styles.recHintArmed]}
                  maxFontSizeMultiplier={1.0}
                  numberOfLines={1}
                >
                  {cancelArmed ? t('media.recordingCancel') : t('media.slideToCancel')}
                </RNText>
                {cancelArmed ? (
                  <Trash2 size={18} color="#FF453A" strokeWidth={2.25} />
                ) : null}
              </Animated.View>
            ) : null}
            <View style={[styles.fieldRow, voice.recording && styles.hidden]}>
              <Animated.View
                style={styles.inputWrapper}
                layout={LinearTransition.duration(160)}
              >
                <TextInput
                  key={`${generation}:${localGeneration}`}
                  onLayout={onFieldLayout}
                  ref={inputRef}
                  defaultValue={draftRef.current}
                  onChangeText={handleChangeText}
                  placeholder={placeholder}
                  placeholderTextColor={COLORS.gray[500]}
                  multiline
                  style={[styles.input, tall && styles.inputTall]}
                  keyboardAppearance="dark"
                  autoCapitalize="sentences"
                  maxFontSizeMultiplier={1.0}
                  textAlignVertical="center"
                  underlineColorAndroid="transparent"
                  accessibilityLabel={t('chat.inputAccessibilityLabel')}
                />
                {tall ? (
                  <Pressable
                    onPress={openExpanded}
                    hitSlop={8}
                    style={styles.expandButton}
                    accessibilityRole="button"
                    accessibilityLabel={t('composer.expand')}
                  >
                    <Maximize2 size={15} color={COLORS.gray[400]} strokeWidth={2.25} />
                  </Pressable>
                ) : null}
              </Animated.View>
              <Pressable
                onPress={toggleEmoji}
                hitSlop={6}
                style={styles.inlineButton}
                accessibilityRole="button"
                accessibilityLabel={t('composer.emoji')}
              >
                <Smile
                  size={22}
                  color={emojiOpen ? COLORS.white : COLORS.gray[400]}
                  strokeWidth={2}
                />
              </Pressable>
              {hasText ? (
                <Animated.View style={[styles.sendSlot, sendStyle]}>
                  <Pressable
                    onPress={handleSend}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={t('chat.sendAccessibilityLabel')}
                    style={({ pressed }) => [
                      styles.sendButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <SendHorizontal size={17} color={COLORS.black} strokeWidth={2.5} />
                  </Pressable>
                </Animated.View>
              ) : null}
            </View>
          </GlassSurface>

          {!hasText ? (
            <Animated.View style={micStyle} exiting={FadeOut.duration(SEND_IN_MS)}>
              <Pressable
                onPressIn={onMicPressIn}
                onTouchMove={onMicTouchMove}
                onPressOut={onMicPressOut}
                delayLongPress={100000}
                style={[styles.roundButton, voice.recording && styles.micRecording]}
                accessibilityRole="button"
                accessibilityLabel={t('composer.voiceNote')}
                accessibilityHint={t('media.recordingHint')}
              >
                <GlassSurface radius={22} style={styles.roundButton}>
                  <View style={styles.roundButtonInner}>
                    <Mic
                      size={22}
                      color={voice.recording ? '#FF453A' : COLORS.white}
                      strokeWidth={2.25}
                    />
                  </View>
                </GlassSurface>
              </Pressable>
            </Animated.View>
          ) : null}
        </Animated.View>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  column: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  roundButtonInner: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  capsule: {
    flex: 1,
    minHeight: 44,
    borderRadius: 24,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingLeft: 4,
    paddingRight: 4,
    paddingVertical: 4,
  },
  inputWrapper: {
    flex: 1,
    justifyContent: 'center',
  },
  // Sits at the top right of the field once it has two or more lines.
  expandButton: {
    position: 'absolute',
    top: 4,
    right: 2,
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    backgroundColor: 'transparent',
    minHeight: MIN_FIELD_HEIGHT,
    maxHeight: MAX_FIELD_HEIGHT,
    paddingHorizontal: 12,
    // iOS multiline fields sit their text at the top of the box; with the
    // box exactly one line tall plus symmetric padding, the placeholder and
    // the first line land centred. Keep MIN_FIELD_HEIGHT in step.
    paddingTop: 8,
    paddingBottom: 8,
    color: COLORS.white,
    fontFamily: 'Archivo_400Regular',
    fontSize: 16,
    lineHeight: 20,
  },
  inputTall: { paddingRight: 30 },
  inlineButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendSlot: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pressed: { opacity: 0.7 },
  emojiStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    paddingHorizontal: 4,
  },
  emojiChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiGlyph: { fontSize: 26 },
  hidden: { position: 'absolute', opacity: 0, height: 0, overflow: 'hidden' },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 14,
  },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF453A' },
  recTime: {
    color: COLORS.white,
    fontSize: 15,
    fontFamily: 'Archivo_500Medium',
    fontVariant: ['tabular-nums'],
    minWidth: 40,
  },
  recHint: {
    flex: 1,
    color: COLORS.gray[400],
    fontSize: 14,
    fontFamily: 'Archivo_400Regular',
    textAlign: 'center',
  },
  recHintArmed: { color: '#FF453A' },
  micRecording: { transform: [{ scale: 1.15 }] },
});
