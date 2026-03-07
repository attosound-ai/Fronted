import { useCallback } from 'react';
import {
  FlatList,
  RefreshControl,
  ActivityIndicator,
  View,
  StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING } from '@/constants/theme';
import { Text } from '@/components/ui/Text';
import { useConversations } from '../hooks/useConversations';
import { ConversationsHeader } from './ConversationsHeader';
import { ConversationItem } from './ConversationItem';
import { EmptyConversations } from './EmptyConversations';
import type { ChatConversation } from '../types';

export function ConversationList() {
  const { conversations, isLoading, isRefreshing, error, refresh } = useConversations();

  const handleConversationPress = useCallback(
    (conversationId: string, participantName: string, participantId: string) => {
      router.push({
        pathname: '/chat',
        params: { conversationId, participantName, participantId },
      });
    },
    []
  );

  const handleNewMessage = useCallback(() => {
    router.push('/new-message');
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: ChatConversation }) => (
      <ConversationItem conversation={item} onPress={handleConversationPress} />
    ),
    [handleConversationPress]
  );

  if (isLoading && conversations.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ConversationsHeader onNewMessage={handleNewMessage} />
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={COLORS.white} />
        </View>
      </SafeAreaView>
    );
  }

  if (error && conversations.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ConversationsHeader onNewMessage={handleNewMessage} />
        <View style={styles.error}>
          <Text variant="h2">Error loading messages</Text>
          <Text variant="body" style={styles.errorText}>
            {error.message}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ConversationsHeader onNewMessage={handleNewMessage} />
      <FlatList
        data={conversations}
        renderItem={renderItem}
        keyExtractor={(item) => item.conversationId}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={COLORS.white}
          />
        }
        ListEmptyComponent={EmptyConversations}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
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
  error: {
    flex: 1,
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  errorText: {
    color: COLORS.gray[500],
    marginTop: SPACING.sm,
  },
});
