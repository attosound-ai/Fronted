import { useCallback, useEffect, useState } from 'react';
import {
  View,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { COLORS, SPACING } from '@/constants/theme';
import { Text } from '@/components/ui/Text';
import { showToast } from '@/components/ui/Toast';
import { useChat } from '../hooks/useChat';
import { useRealtimeChat } from '../hooks/useRealtimeChat';
import { useChatStore } from '../stores/chatStore';
import { ChatHeader } from './ChatHeader';
import { MessageBubble } from './MessageBubble';
import { ChatInputBar } from './ChatInputBar';
import { TypingIndicator } from './TypingIndicator';
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
    refresh,
  } = useChat(conversationId);

  // WebSocket real-time layer
  const { sendViaSocket, markRead, sendTyping } = useRealtimeChat(conversationId);

  // Typing state for this conversation
  const typingUsers = useChatStore((s) => s.typingUsers[conversationId]);
  const isParticipantTyping = typingUsers ? typingUsers.size > 0 : false;

  // Mark messages as read when screen is focused and new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      markRead();
    }
  }, [messages.length, markRead]);

  useEffect(() => {
    if (sendError) {
      showToast('Failed to send message');
    }
  }, [sendError]);

  const handleSend = useCallback(
    async (content: string) => {
      try {
        await sendViaSocket(content);
      } catch {
        // Fallback to REST if WebSocket fails
        sendMessage(content);
      }
    },
    [sendViaSocket, sendMessage]
  );

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

  // Custom pull-to-refresh for inverted FlatList (RefreshControl doesn't work with inverted)
  const [pullRefreshing, setPullRefreshing] = useState(false);

  const handleScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      // On inverted FlatList, overscrolling past newest messages gives negative contentOffset.y
      if (event.nativeEvent.contentOffset.y < -80 && !pullRefreshing) {
        setPullRefreshing(true);
        Promise.resolve(refresh()).finally(() => setPullRefreshing(false));
      }
    },
    [refresh, pullRefreshing]
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
      ) : (
        <FlatList
          style={styles.list}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.messageId}
          inverted
          keyboardDismissMode="interactive"
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          onScrollEndDrag={handleScrollEndDrag}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text variant="body" style={styles.emptyText}>
                No messages yet. Say hello!
              </Text>
            </View>
          }
          ListHeaderComponent={
            <>
              {pullRefreshing ? (
                <View style={styles.pullRefresh}>
                  <ActivityIndicator size="small" color={COLORS.white} />
                </View>
              ) : null}
              {isParticipantTyping ? (
                <TypingIndicator name={participantName} />
              ) : null}
            </>
          }
          windowSize={10}
          maxToRenderPerBatch={10}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
      <ChatInputBar
        onSend={handleSend}
        isSending={isSending}
        onTyping={sendTyping}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.black,
  },
  list: {
    flex: 1,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  empty: {
    paddingVertical: SPACING.xl,
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
  pullRefresh: {
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
});
