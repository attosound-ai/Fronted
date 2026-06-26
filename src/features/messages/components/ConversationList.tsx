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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { CollapsibleHeader } from '@/components/ui/CollapsibleHeader';
import { useCollapsibleHeader } from '@/hooks/useCollapsibleHeader';
import { FLOATING_NAVBAR_CLEARANCE } from '@/components/navigation/navbarMetrics';
import { COLORS, SPACING } from '@/constants/theme';
import { Text } from '@/components/ui/Text';
import { MessagesSkeleton } from '@/components/ui/Skeleton';
import { useConversations } from '../hooks/useConversations';
import { ConversationsHeader } from './ConversationsHeader';
import { ConversationItem } from './ConversationItem';
import { EmptyConversations } from './EmptyConversations';
import type { ChatConversation } from '../types';

interface ConversationListProps {
  /** iPad split-view: highlight the active conversation */
  selectedConversationId?: string;
  /** iPad split-view: open chat inline instead of pushing a route */
  onSelectConversation?: (
    conversationId: string,
    participantName: string,
    participantId: string
  ) => void;
}

export function ConversationList({
  selectedConversationId,
  onSelectConversation,
}: ConversationListProps = {}) {
  const { t } = useTranslation('messages');
  const insets = useSafeAreaInsets();
  const { conversations, isLoading, isRefreshing, error, refresh } = useConversations();
  const header = useCollapsibleHeader();

  const handleConversationPress = useCallback(
    (conversationId: string, participantName: string, participantId: string) => {
      if (onSelectConversation) {
        onSelectConversation(conversationId, participantName, participantId);
      } else {
        router.push({
          pathname: '/chat',
          params: { conversationId, participantName, participantId },
        });
      }
    },
    [onSelectConversation]
  );

  const handleNewMessage = useCallback(() => {
    router.push('/new-message');
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: ChatConversation }) => (
      <ConversationItem
        conversation={item}
        onPress={handleConversationPress}
        isSelected={item.conversationId === selectedConversationId}
      />
    ),
    [handleConversationPress, selectedConversationId]
  );

  const fab = (
    <TouchableOpacity
      onPress={handleNewMessage}
      style={[styles.fab, { bottom: insets.bottom + FLOATING_NAVBAR_CLEARANCE + 8 }]}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={t('header.newMessageAccessibility')}
    >
      <Pencil size={24} color="#000" strokeWidth={2.25} />
    </TouchableOpacity>
  );

  if (isLoading && conversations.length === 0) {
    return (
      <View style={styles.container}>
        <MessagesSkeleton />
        {fab}
        <CollapsibleHeader
          animatedStyle={header.animatedStyle}
          rowStyle={{ paddingHorizontal: 0 }}
        >
          <ConversationsHeader containerStyle={{ flex: 1, paddingVertical: 0 }} />
        </CollapsibleHeader>
      </View>
    );
  }

  if (error && conversations.length === 0) {
    return (
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={[styles.error, { paddingTop: header.height }]}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={refresh}
              tintColor={COLORS.white}
              progressViewOffset={header.height}
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
        <CollapsibleHeader
          animatedStyle={header.animatedStyle}
          rowStyle={{ paddingHorizontal: 0 }}
        >
          <ConversationsHeader containerStyle={{ flex: 1, paddingVertical: 0 }} />
        </CollapsibleHeader>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={conversations}
        renderItem={renderItem}
        keyExtractor={(item) => item.conversationId}
        onScroll={header.onScroll}
        scrollEventThrottle={header.scrollEventThrottle}
        contentContainerStyle={{
          paddingTop: header.height,
          paddingBottom: insets.bottom + FLOATING_NAVBAR_CLEARANCE,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={COLORS.white}
            progressViewOffset={header.height}
          />
        }
        ListEmptyComponent={EmptyConversations}
        showsVerticalScrollIndicator={false}
      />
      {fab}
      <CollapsibleHeader
        animatedStyle={header.animatedStyle}
        rowStyle={{ paddingHorizontal: 0 }}
      >
        <ConversationsHeader containerStyle={{ flex: 1, paddingVertical: 0 }} />
      </CollapsibleHeader>
    </View>
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
