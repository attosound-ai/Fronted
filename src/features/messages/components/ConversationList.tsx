import { useCallback } from 'react';
import {
  FlatList,
  RefreshControl,
  ActivityIndicator,
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { COLORS, SPACING } from '@/constants/theme';
import { Text } from '@/components/ui/Text';
import { useConversations } from '../hooks/useConversations';
import { ConversationsHeader } from './ConversationsHeader';
import { ConversationItem } from './ConversationItem';
import { EmptyConversations } from './EmptyConversations';
import type { ChatConversation } from '../types';

export function ConversationList() {
  const { t } = useTranslation('messages');
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
        <ScrollView
          contentContainerStyle={styles.error}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={refresh}
              tintColor={COLORS.white}
            />
          }
        >
          <Ionicons name="cloud-offline-outline" size={40} color="#555" />
          <Text variant="h2" style={styles.errorTitle}>{t('error.loadingMessages')}</Text>
          <Text variant="body" style={styles.errorText}>
            {error.message}
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={refresh} activeOpacity={0.7}>
            <Ionicons name="refresh" size={18} color="#000" />
            <Text style={styles.retryText}>{t('error.retry', { defaultValue: 'Retry' })}</Text>
          </TouchableOpacity>
        </ScrollView>
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
    alignItems: 'center',
    padding: SPACING.lg,
    gap: 8,
  },
  errorTitle: {
    color: COLORS.white,
    marginTop: 8,
  },
  errorText: {
    color: COLORS.gray[500],
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.white,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 16,
  },
  retryText: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 14,
    color: '#000',
  },
});
