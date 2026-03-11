import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
    setText('');
  };

  const canSend = text.trim().length > 0 && !isSending;

  const bottomPadding = keyboardVisible
    ? SPACING.xs
    : Math.max(insets.bottom, SPACING.sm);

  return (
    <View style={[styles.container, { paddingBottom: bottomPadding }]}>
      <TextInput
        style={styles.input}
        placeholder={t('chat.inputPlaceholder')}
        placeholderTextColor={COLORS.gray[500]}
        value={text}
        onChangeText={handleChangeText}
        multiline
        maxLength={2000}
        returnKeyType={Platform.OS === 'ios' ? 'default' : 'send'}
        blurOnSubmit={false}
        accessibilityLabel={t('chat.inputAccessibilityLabel')}
      />
      <TouchableOpacity
        onPress={handleSend}
        disabled={!canSend}
        style={[styles.sendButton, canSend && styles.sendButtonActive]}
        accessibilityRole="button"
        accessibilityLabel={t('chat.sendAccessibilityLabel')}
      >
        <Ionicons
          name="send"
          size={18}
          color={canSend ? COLORS.white : COLORS.gray[600]}
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
  input: {
    flex: 1,
    backgroundColor: COLORS.background.secondary,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border.light,
    paddingHorizontal: SPACING.md,
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
    maxHeight: 120,
    minHeight: 40,
    color: COLORS.white,
    fontFamily: 'Archivo_400Regular',
    fontSize: 15,
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
    backgroundColor: COLORS.primary,
  },
  sendIcon: {
    marginLeft: 2,
  },
});
