import { useCallback, useEffect } from 'react';
import {
  View,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { COLORS, SPACING } from '@/constants/theme';
import { Text } from '@/components/ui/Text';
import { showToast } from '@/components/ui/Toast';
import { useChat } from '../hooks/useChat';
import { ChatHeader } from './ChatHeader';
import { MessageBubble } from './MessageBubble';
import { ChatInputBar } from './ChatInputBar';
import type { ChatMessage } from '../types';

interface ChatScreenProps {
  conversationId: string;
  participantName: string;
  participantId?: string;
}

export function ChatScreen({
  conversationId,
  participantName,
  participantId,
}: ChatScreenProps) {
  const user = useAuthStore((s) => s.user);
  const userId = user ? String(user.id) : '';

  const {
    messages,
    isLoading,
    isFetchingMore,
    hasMore,
    sendMessage,
    isSending,
    loadMore,
    sendError,
  } = useChat(conversationId);

  useEffect(() => {
    if (sendError) {
      showToast('Failed to send message');
    }
  }, [sendError]);

  const handleBack = useCallback(() => {
    router.back();
  }, []);

  const handleEndReached = useCallback(() => {
    if (hasMore && !isFetchingMore) {
      loadMore();
    }
  }, [hasMore, isFetchingMore, loadMore]);

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <MessageBubble message={item} isOwn={item.senderId === userId} />
    ),
    [userId]
  );

  const renderFooter = useCallback(() => {
    if (!isFetchingMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator color={COLORS.white} />
      </View>
    );
  }, [isFetchingMore]);

  if (!user) return null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <ChatHeader
        participantName={participantName}
        participantId={participantId || ''}
        onBack={handleBack}
      />
      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={COLORS.white} />
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.empty}>
          <Text variant="body" style={styles.emptyText}>
            No messages yet. Say hello!
          </Text>
        </View>
      ) : (
        <FlatList
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.messageId}
          inverted
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          ListFooterComponent={renderFooter}
          windowSize={10}
          maxToRenderPerBatch={10}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
      <ChatInputBar onSend={sendMessage} isSending={isSending} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.black,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.gray[500],
  },
  listContent: {
    paddingVertical: SPACING.sm,
  },
  footer: {
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
});
