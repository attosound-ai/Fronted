import { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING } from '@/constants/theme';

interface ChatInputBarProps {
  onSend: (content: string) => void;
  isSending: boolean;
}

export function ChatInputBar({ onSend, isSending }: ChatInputBarProps) {
  const [text, setText] = useState('');

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    onSend(trimmed);
    setText('');
  };

  const canSend = text.trim().length > 0 && !isSending;

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Type a message..."
        placeholderTextColor={COLORS.gray[500]}
        value={text}
        onChangeText={setText}
        multiline
        maxLength={2000}
        returnKeyType={Platform.OS === 'ios' ? 'default' : 'send'}
        blurOnSubmit={false}
        accessibilityLabel="Message input"
      />
      <TouchableOpacity
        onPress={handleSend}
        disabled={!canSend}
        style={styles.sendButton}
        accessibilityRole="button"
        accessibilityLabel="Send message"
      >
        <Ionicons
          name="send"
          size={22}
          color={canSend ? COLORS.primary : COLORS.gray[600]}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.black,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.border.dark,
    gap: SPACING.sm,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.background.secondary,
    borderRadius: 20,
    paddingHorizontal: SPACING.md,
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
    maxHeight: 100,
    color: COLORS.white,
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
  },
  sendButton: {
    paddingBottom: Platform.OS === 'ios' ? 6 : 4,
  },
});
