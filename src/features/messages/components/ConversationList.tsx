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
import { WifiOff, RefreshCw, Pencil } from 'lucide-react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { COLORS, SPACING } from '@/constants/theme';
import { Text } from '@/components/ui/Text';
import { MessagesSkeleton } from '@/components/ui/Skeleton';
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

  const fab = (
    <TouchableOpacity
      onPress={handleNewMessage}
      style={styles.fab}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={t('header.newMessageAccessibility')}
    >
      <Pencil size={24} color="#000" strokeWidth={2.25} />
    </TouchableOpacity>
  );

  if (isLoading && conversations.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ConversationsHeader />
        <MessagesSkeleton />
        {fab}
      </SafeAreaView>
    );
  }

  if (error && conversations.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ConversationsHeader />
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
          <WifiOff size={40} color="#555" strokeWidth={2.25} />
          <Text variant="h2" style={styles.errorTitle}>
            {t('error.loadingMessages')}
          </Text>
          <Text variant="body" style={styles.errorText}>
            {error.message}
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={refresh}
            activeOpacity={0.7}
          >
            <RefreshCw size={18} color="#000" strokeWidth={2.25} />
            <Text style={styles.retryText}>
              {t('error.retry', { defaultValue: 'Retry' })}
            </Text>
          </TouchableOpacity>
        </ScrollView>
        {fab}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ConversationsHeader />
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
      {fab}
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
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
