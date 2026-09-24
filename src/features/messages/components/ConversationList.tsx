import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  ActivityIndicator,
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Archive, WifiOff, RefreshCw, Pencil } from 'lucide-react-native';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
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
import {
  isArchived,
  orderConversations,
  useConversationPrefsStore,
} from '../stores/conversationPrefsStore';
import { useConversationViewStore } from '../stores/conversationViewStore';
import { ConversationSwipeRow } from './ConversationSwipeRow';
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
  const {
    conversations: rawConversations,
    isLoading,
    isRefreshing,
    error,
    refresh,
  } = useConversations();
  const pinned = useConversationPrefsStore((s) => s.pinned);
  const archived = useConversationPrefsStore((s) => s.archived);
  // Pinned first, archived hidden until something new arrives in them.
  const [showArchived, setShowArchived] = useState(false);
  const unarchive = useConversationPrefsStore((s) => s.unarchive);
  const archivedList = useMemo(
    () =>
      rawConversations.filter((c) =>
        isArchived(archived, c.conversationId, c.lastMessageAt)
      ),
    [rawConversations, archived]
  );
  // Which slice the views button in the header asked for. "All" is the
  // WhatsApp and Telegram list everybody sees by default.
  const view = useConversationViewStore((s) => s.view);
  const drafts = useConversationPrefsStore((s) => s.drafts);
  const conversations = useMemo(() => {
    const live = rawConversations.filter(
      (c) => !isArchived(archived, c.conversationId, c.lastMessageAt)
    );
    const slice =
      view === 'unread'
        ? live.filter((c) => c.unreadCount > 0)
        : view === 'drafts'
          ? live.filter((c) => (drafts[c.conversationId] ?? '').trim().length > 0)
          : view === 'archived'
            ? archivedList
            : live;
    return orderConversations(slice, pinned);
  }, [rawConversations, pinned, archived, archivedList, drafts, view]);
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

  // WhatsApp keeps an "Archived" row at the end of the list; tapping it shows
  // the hidden chats, and tapping one of those brings it back.
  const archivedFooter =
    archivedList.length > 0 && view === 'all' ? (
      <View>
        <TouchableOpacity
          onPress={() => setShowArchived((v) => !v)}
          style={styles.archivedRow}
          accessibilityRole="button"
          accessibilityState={{ expanded: showArchived }}
        >
          <Archive size={18} color={COLORS.gray[500]} strokeWidth={2} />
          <Text variant="body" style={styles.archivedLabel}>
            {t('listActions.archivedCount', { count: archivedList.length })}
          </Text>
        </TouchableOpacity>
        {showArchived
          ? archivedList.map((item) => (
              <TouchableOpacity
                key={item.conversationId}
                onPress={() => {
                  unarchive(item.conversationId);
                  analytics.capture(ANALYTICS_EVENTS.MESSAGES.CONVERSATION_ARCHIVED, {
                    conversation_id: item.conversationId,
                    restored: true,
                  });
                }}
                accessibilityRole="button"
                accessibilityLabel={t('listActions.unarchive')}
              >
                <ConversationItem conversation={item} onPress={handleConversationPress} />
              </TouchableOpacity>
            ))
          : null}
      </View>
    ) : null;

  const renderItem = useCallback(
    ({ item }: { item: ChatConversation }) => (
      <ConversationSwipeRow conversation={item}>
        <ConversationItem
          conversation={item}
          onPress={handleConversationPress}
          isSelected={item.conversationId === selectedConversationId}
        />
      </ConversationSwipeRow>
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
        ListEmptyComponent={
          view === 'all' ? (
            EmptyConversations
          ) : (
            <View style={styles.emptyView}>
              <Text variant="body" style={styles.emptyViewText}>
                {view === 'unread'
                  ? t('header.emptyUnread')
                  : view === 'drafts'
                    ? t('header.emptyDrafts')
                    : t('header.emptyArchived')}
              </Text>
            </View>
          )
        }
        ListFooterComponent={archivedFooter}
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
  archivedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
  },
  archivedLabel: { color: COLORS.gray[500] },
  emptyView: {
    alignItems: 'center',
    paddingTop: SPACING.xl * 2,
    paddingHorizontal: SPACING.lg,
  },
  emptyViewText: { color: COLORS.gray[500], textAlign: 'center' },
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
