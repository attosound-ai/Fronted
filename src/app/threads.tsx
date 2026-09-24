import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Bookmark, ChevronLeft, MessagesSquare } from 'lucide-react-native';

import { COLORS, SPACING } from '@/constants/theme';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { CounterBadge } from '@/components/ui/CounterBadge';
import { haptic } from '@/lib/haptics/hapticService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { useAuthStore } from '@/stores/authStore';
import { useThreadsInbox } from '@/features/messages/hooks/useThreadsInbox';
import { useParticipantProfile } from '@/features/messages/hooks/useParticipantAvatar';
import { useThreadSavedStore } from '@/features/messages/stores/threadSavedStore';
import { stripMarkdown } from '@/features/messages/thread/markdown';
import { formatChatListTimestamp } from '@/utils/formatters';
import type { InboxThread } from '@/features/messages/types';

/**
 * Slack's "Threads": every thread you take part in, across every
 * conversation, newest reply first. It is the one view in Slack that is not a
 * channel, which is why it lives behind the views button rather than in the
 * conversation list, where it would read as one more chat.
 *
 * The unread count and the follow flag come from chat-service, so they match
 * on the phone and the iPad and survive a reinstall.
 */
export default function ThreadsScreen() {
  const { t } = useTranslation('messages');
  const insets = useSafeAreaInsets();
  const userId = useAuthStore((s) => (s.user ? String(s.user.id) : ''));
  const { threads, unreadTotal, isLoading, isRefreshing, error, refresh, markRead } =
    useThreadsInbox();
  const [unreadOnly, setUnreadOnly] = useState(false);

  // A thread saved from the reply rule sits at the top, which is the only
  // reason to save one.
  const saved = useThreadSavedStore((s) => s.saved);
  const rows = useMemo(() => {
    const slice = unreadOnly ? threads.filter((thread) => thread.unread > 0) : threads;
    return [...slice].sort((a, b) => {
      const pin = Number(saved[b.threadId] === true) - Number(saved[a.threadId] === true);
      return pin !== 0 ? pin : b.lastReplyAt - a.lastReplyAt;
    });
  }, [threads, unreadOnly, saved]);

  const open = useCallback(
    (thread: InboxThread, name: string) => {
      void haptic('selection');
      markRead(thread.conversationId, thread.threadId);
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.THREAD_OPENED, {
        conversation_id: thread.conversationId,
        thread_id: thread.threadId,
        reply_count: thread.replyCount,
        source: 'inbox',
      });
      router.push({
        pathname: '/chat-thread',
        params: {
          conversationId: thread.conversationId,
          threadId: thread.threadId,
          participantId: thread.participantId,
          participantName: name,
        },
      });
    },
    [markRead]
  );

  const renderItem = useCallback(
    ({ item }: { item: InboxThread }) => (
      <ThreadRow
        thread={item}
        selfId={userId}
        saved={saved[item.threadId] === true}
        onPress={open}
      />
    ),
    [open, saved, userId]
  );

  const empty = (
    <View style={styles.empty}>
      <MessagesSquare size={40} color="#555" strokeWidth={1.75} />
      <Text variant="h2" style={styles.emptyTitle}>
        {unreadOnly ? t('threads.allRead') : t('threads.empty')}
      </Text>
      {!unreadOnly ? (
        <Text variant="body" style={styles.emptyBody}>
          {t('threads.emptyBody')}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel={t('chatHeader.backAccessibilityLabel')}
        >
          <ChevronLeft size={26} color={COLORS.white} strokeWidth={2.25} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>{t('threads.title')}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {t('threads.subtitle')}
          </Text>
        </View>
        {/* Slack's own filter, in the same corner: the list narrows to what
            still has replies you have not read. */}
        <Pressable
          onPress={() => {
            void haptic('selection');
            setUnreadOnly((value) => !value);
          }}
          hitSlop={10}
          style={[styles.filter, unreadOnly && styles.filterOn]}
          accessibilityRole="switch"
          accessibilityState={{ checked: unreadOnly }}
          accessibilityLabel={t('threads.unreadOnly')}
        >
          <Text style={[styles.filterText, unreadOnly && styles.filterTextOn]}>
            {unreadOnly ? t('threads.showAll') : t('threads.unreadOnly')}
          </Text>
          {unreadTotal > 0 && !unreadOnly ? (
            <CounterBadge
              count={unreadTotal}
              color={COLORS.white}
              textColor="#000000"
              fontWeight="semibold"
              size={18}
            />
          ) : null}
        </Pressable>
      </View>

      {isLoading && threads.length === 0 ? (
        <ActivityIndicator style={styles.loading} color={COLORS.white} />
      ) : (
        <FlatList
          data={rows}
          renderItem={renderItem}
          keyExtractor={(item) => `${item.conversationId}:${item.threadId}`}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + SPACING.xl },
            rows.length === 0 && styles.listEmpty,
          ]}
          ListEmptyComponent={
            error ? (
              <View style={styles.empty}>
                <Text variant="body" style={styles.emptyBody}>
                  {t('threads.error')}
                </Text>
              </View>
            ) : (
              empty
            )
          }
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => void refresh()}
              tintColor={COLORS.white}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

/**
 * One thread. Slack's row names the person, then the message that started the
 * thread, then the newest reply underneath, so you can tell from the list
 * whether the thread moved on without opening it.
 */
function ThreadRow({
  thread,
  selfId,
  saved,
  onPress,
}: {
  thread: InboxThread;
  selfId: string;
  saved: boolean;
  onPress: (thread: InboxThread, name: string) => void;
}) {
  const { t } = useTranslation('messages');
  const { avatarUri, username, role } = useParticipantProfile(thread.participantId);
  const name = username || thread.participantName || t('conversation.fallbackUserName');
  const root = stripMarkdown(thread.rootPreview);
  const reply = stripMarkdown(thread.replyPreview);
  const mine = thread.lastReplySenderId === selfId;

  return (
    <Pressable
      onPress={() => onPress(thread, name)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={t('threads.accessibility', {
        name,
        count: thread.replyCount,
      })}
    >
      <Avatar
        uri={avatarUri}
        size="md"
        fallbackText={name}
        creatorRing={role === 'creator'}
      />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text variant="h3" numberOfLines={1} style={styles.rowName}>
            {name}
          </Text>
          {saved ? (
            <Bookmark
              size={13}
              color={COLORS.white}
              fill={COLORS.white}
              strokeWidth={2}
            />
          ) : null}
          {thread.lastReplyAt > 0 ? (
            <Text variant="small" style={styles.rowTime}>
              {formatChatListTimestamp(new Date(thread.lastReplyAt).toISOString())}
            </Text>
          ) : null}
        </View>
        {root ? (
          <Text variant="body" numberOfLines={1} style={styles.rowRoot}>
            {root}
          </Text>
        ) : null}
        <View style={styles.rowBottom}>
          <Text
            variant="body"
            numberOfLines={1}
            style={[styles.rowReply, thread.unread > 0 && styles.rowReplyUnread]}
          >
            {mine ? `${t('threads.repliedBy')}: ${reply}` : reply}
          </Text>
          {thread.unread > 0 ? (
            <CounterBadge
              count={thread.unread}
              color={COLORS.white}
              textColor="#000000"
              fontWeight="semibold"
              size={18}
            />
          ) : null}
        </View>
        <Text variant="small" style={styles.rowMeta}>
          {t('thread.replies', { count: thread.replyCount })}
          {thread.following ? '' : ` · ${t('threads.unfollowed')}`}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  iconButton: { padding: 4 },
  headerText: { flex: 1 },
  title: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 17,
    color: COLORS.white,
  },
  subtitle: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 12,
    color: COLORS.gray[500],
    marginTop: 1,
  },
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  filterOn: { backgroundColor: COLORS.white, borderColor: COLORS.white },
  filterText: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 12,
    color: COLORS.white,
  },
  filterTextOn: { color: COLORS.black },
  loading: { marginTop: SPACING.xl },
  list: { paddingTop: SPACING.xs },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
  },
  rowPressed: { backgroundColor: 'rgba(255,255,255,0.05)' },
  rowBody: { flex: 1, gap: 2 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  rowName: { flex: 1, color: COLORS.white },
  rowTime: { color: COLORS.gray[500] },
  rowRoot: { color: COLORS.gray[500] },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  rowReply: { flex: 1, color: COLORS.gray[400] },
  rowReplyUnread: { color: COLORS.white, fontFamily: 'Archivo_500Medium' },
  rowMeta: { color: COLORS.gray[600], marginTop: 2 },
  empty: {
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xl,
  },
  emptyTitle: { color: COLORS.white, textAlign: 'center' },
  emptyBody: { color: COLORS.gray[500], textAlign: 'center' },
});
