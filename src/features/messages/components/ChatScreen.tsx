import { useCallback, useEffect, useRef, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { COLORS, SPACING } from '@/constants/theme';
import { Text } from '@/components/ui/Text';
import { showToast } from '@/components/ui/Toast';
import { useChat } from '../hooks/useChat';
import { useRealtimeChat } from '../hooks/useRealtimeChat';
import { useChatStore } from '../stores/chatStore';
import { messageService } from '../services/messageService';
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
  const { t } = useTranslation('messages');
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const userId = user ? String(user.id) : '';
  const insets = useSafeAreaInsets();
  // Approximate header height: safeArea top + xs padding + row (~44) + sm padding
  const headerHeight = insets.top + SPACING.xs + 44 + SPACING.sm;

  const {
    messages,
    isLoading,
    isFetchingMore,
    hasMore,
    sendMessageAsync,
    isSending,
    loadMore,
    refresh,
  } = useChat(conversationId);

  // WebSocket real-time layer
  const { sendViaSocket, markRead, sendTyping } = useRealtimeChat(conversationId);

  // Force refetch on mount to pick up messages received while screen was unmounted
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      refresh();
    }
  }, [refresh]);

  // Typing state for this conversation
  const typingUsers = useChatStore((s) => s.typingUsers[conversationId]);
  const isParticipantTyping = typingUsers ? typingUsers.size > 0 : false;

  // Mark messages as read via REST (reliable) + WebSocket (real-time broadcast).
  useEffect(() => {
    if (messages.length === 0 || !conversationId) return;

    // REST call — works even if WebSocket isn't connected yet
    messageService.markRead(conversationId).then(() => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MESSAGES.CONVERSATIONS });
    }).catch(() => {});

    // Also try WebSocket so the other participant gets the read receipt in real-time
    markRead();
  }, [messages.length, conversationId, markRead, queryClient]);

  const handleSend = useCallback(
    async (content: string) => {
      try {
        await sendViaSocket(content);
      } catch {
        try {
          await sendMessageAsync(content);
        } catch {
          showToast(t('chat.errorFailedToSend'));
        }
      }
    },
    [sendViaSocket, sendMessageAsync, t]
  );

  const handleBack = useCallback(() => {
    // Refresh conversation list on exit so unread badges update
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MESSAGES.CONVERSATIONS });
    router.back();
  }, [queryClient]);

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
    return (
      <View>
        {isFetchingMore && (
          <View style={styles.footer}>
            <ActivityIndicator color={COLORS.white} />
          </View>
        )}
        {/* Spacer so oldest messages don't hide behind the blur header */}
        <View style={{ height: headerHeight }} />
      </View>
    );
  }, [isFetchingMore, headerHeight]);

  if (!user) return null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={styles.body}>
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
                  {t('chat.emptyMessages')}
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
                {isParticipantTyping ? <TypingIndicator name={participantName} /> : null}
              </>
            }
            windowSize={10}
            maxToRenderPerBatch={10}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
      <ChatInputBar onSend={handleSend} isSending={isSending} onTyping={sendTyping} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.black,
  },
  body: {
    flex: 1,
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
