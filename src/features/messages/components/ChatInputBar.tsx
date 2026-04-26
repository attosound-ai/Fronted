import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Keyboard,
  type TextInput as TextInputType,
} from 'react-native';
import { SendHorizontal } from 'lucide-react-native';
import { PostHogMaskView } from 'posthog-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { COLORS, SPACING } from '@/constants/theme';

interface ChatInputBarProps {
  onSend: (content: string) => void;
  isSending: boolean;
  onTyping?: (isTyping: boolean) => void;
}

const TYPING_DEBOUNCE_MS = 2000;

export function ChatInputBar({ onSend, isSending, onTyping }: ChatInputBarProps) {
  const { t } = useTranslation('messages');
  const [text, setText] = useState('');
  const inputRef = useRef<TextInputType>(null);
  const justSentRef = useRef(false);
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const emitTyping = useCallback(
    (value: string) => {
      if (!onTyping) return;

      if (value.length > 0 && !isTypingRef.current) {
        isTypingRef.current = true;
        onTyping(true);
      }

      // Reset the stop-typing timer
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
      typingTimeout.current = setTimeout(() => {
        if (isTypingRef.current) {
          isTypingRef.current = false;
          onTyping(false);
        }
      }, TYPING_DEBOUNCE_MS);
    },
    [onTyping]
  );

  const handleChangeText = useCallback(
    (value: string) => {
      // After sending, iOS autocorrect may fire onChangeText with the
      // pending suggestion. Ignore it and force-clear the input.
      if (justSentRef.current) {
        justSentRef.current = false;
        if (value.trim()) {
          setText('');
          inputRef.current?.setNativeProps({ text: '' });
        }
        return;
      }
      setText(value);
      emitTyping(value);
    },
    [emitTyping]
  );

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    // Stop typing indicator on send
    if (isTypingRef.current && onTyping) {
      isTypingRef.current = false;
      onTyping(false);
    }
    if (typingTimeout.current) clearTimeout(typingTimeout.current);

    onSend(trimmed);
    justSentRef.current = true;
    setText('');
    inputRef.current?.setNativeProps({ text: '' });
  };

  const canSend = text.trim().length > 0 && !isSending;

  const bottomPadding = keyboardVisible
    ? SPACING.md
    : Math.max(insets.bottom, SPACING.sm);

  return (
    <View style={[styles.container, { paddingBottom: bottomPadding }]}>
      <PostHogMaskView style={styles.inputWrapper}>
        <View style={styles.inputContainer}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={text}
            onChangeText={handleChangeText}
            multiline
            maxLength={2000}
            returnKeyType={Platform.OS === 'ios' ? 'default' : 'send'}
            blurOnSubmit={false}
            accessibilityLabel={t('chat.inputAccessibilityLabel')}
            allowFontScaling={false}
          />
          {text.length === 0 && (
            <Text
              style={styles.placeholderOverlay}
              pointerEvents="none"
              allowFontScaling={false}
              numberOfLines={1}
            >
              {t('chat.inputPlaceholder')}
            </Text>
          )}
        </View>
      </PostHogMaskView>
      <TouchableOpacity
        onPress={handleSend}
        disabled={!canSend}
        style={[styles.sendButton, canSend && styles.sendButtonActive]}
        accessibilityRole="button"
        accessibilityLabel={t('chat.sendAccessibilityLabel')}
      >
        <SendHorizontal
          size={18}
          color={canSend ? '#000000' : COLORS.gray[600]}
          strokeWidth={2.25}
          style={styles.sendIcon}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: SPACING.sm,
    paddingTop: SPACING.sm,
    backgroundColor: COLORS.background.primary,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border.dark,
    gap: SPACING.sm,
  },
  inputWrapper: {
    flex: 1,
  },
  inputContainer: {
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    backgroundColor: COLORS.background.secondary,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border.light,
    paddingHorizontal: SPACING.md,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    maxHeight: 120,
    minHeight: 44,
    color: COLORS.white,
    fontFamily: 'Archivo_400Regular',
    fontSize: 15,
  },
  placeholderOverlay: {
    position: 'absolute',
    left: SPACING.md + 1,
    right: SPACING.md,
    color: COLORS.gray[500],
    fontFamily: 'Archivo_400Regular',
    fontSize: 12,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.gray[800],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Platform.OS === 'ios' ? 2 : 1,
  },
  sendButtonActive: {
    backgroundColor: '#FFFFFF',
  },
  sendIcon: {
    marginLeft: 2,
  },
});
