import { View, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChatScreen, useConversationId } from '@/features/messages';
import { Text } from '@/components/ui/Text';
import { COLORS, SPACING } from '@/constants/theme';

export default function ChatRoute() {
  const { t } = useTranslation('messages');
  const { conversationId, participantName, participantId } = useLocalSearchParams<{
    conversationId: string;
    participantName: string;
    participantId?: string;
  }>();

  const {
    conversationId: resolvedId,
    isResolving,
    error,
    retry,
  } = useConversationId({ conversationId, participantId, participantName });

  if (isResolving) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={COLORS.primary} />
        <Text variant="caption" style={styles.hint}>
          {t('chat.startingConversation')}
        </Text>
      </View>
    );
  }

  if (error || !resolvedId) {
    return (
      <View style={styles.centered}>
        <Text variant="caption" style={styles.errorText}>
          {t('chat.errorFailedToStart')}
        </Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={retry}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Text variant="body" style={styles.retryText}>
            {t('chat.retry')}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ChatScreen
      conversationId={resolvedId}
      participantName={participantName ?? ''}
      participantId={participantId}
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.black,
    gap: SPACING.md,
    padding: SPACING.lg,
  },
  hint: {
    color: COLORS.gray[500],
  },
  errorText: {
    color: '#EF4444',
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm + 2,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
  },
  retryText: {
    color: COLORS.white,
  },
});
