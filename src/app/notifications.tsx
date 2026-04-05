import { useCallback, useState, useEffect } from 'react';
import {
  View,
  SectionList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import { ChevronLeft, CheckCheck } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { NotificationsSkeleton } from '@/components/ui/Skeleton';
import { useNotifications } from '@/features/notifications/hooks/useNotifications';
import { useUnreadCount } from '@/features/notifications/hooks/useUnreadCount';
import { useMarkRead } from '@/features/notifications/hooks/useMarkRead';
import { NotificationRow } from '@/features/notifications/components/NotificationRow';
import { NotificationSectionHeader } from '@/features/notifications/components/NotificationSectionHeader';
import type {
  GroupedNotification,
  NotificationSection,
} from '@/features/notifications/types';

export default function NotificationsScreen() {
  const { t } = useTranslation('notifications');
  const {
    sections,
    isLoading,
    isRefreshing,
    refresh,
    loadMore,
    isFetchingMore,
    hasMore,
    error,
  } = useNotifications();

  const unreadCount = useUnreadCount();
  const { markAsRead, markAllAsRead } = useMarkRead();
  const [manualRefreshing, setManualRefreshing] = useState(false);

  // Auto-mark all as read when entering the screen
  useEffect(() => {
    if (unreadCount > 0) {
      markAllAsRead();
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setManualRefreshing(true);
    await refresh();
    setManualRefreshing(false);
  }, [refresh]);

  const renderItem = useCallback(
    ({ item }: { item: GroupedNotification }) => (
      <NotificationRow group={item} onMarkRead={markAsRead} />
    ),
    [markAsRead]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: NotificationSection }) => (
      <NotificationSectionHeader section={section.title} />
    ),
    []
  );

  const renderFooter = useCallback(() => {
    if (!isFetchingMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator color="#FFF" />
      </View>
    );
  }, [isFetchingMore]);

  const handleEndReached = useCallback(() => {
    if (hasMore && !isFetchingMore) {
      loadMore();
    }
  }, [hasMore, isFetchingMore, loadMore]);

  const renderEmpty = useCallback(() => {
    if (isLoading) return null;
    return (
      <View style={styles.empty}>
        <Bell size={52} color="#444" strokeWidth={2.25} />
        <Text style={styles.emptyTitle}>{t('empty.title')}</Text>
        <Text style={styles.emptySubtitle}>{t('empty.subtitle')}</Text>
      </View>
    );
  }, [isLoading, t]);

  const isEmpty = sections.length === 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ChevronLeft size={28} color="#FFFFFF" strokeWidth={2.25} />
        </TouchableOpacity>
        <Text variant="h3" style={styles.headerTitle}>
          {t('header.title')}
        </Text>
        {unreadCount > 0 ? (
          <TouchableOpacity onPress={markAllAsRead} hitSlop={8}>
            <CheckCheck size={20} color="#FFFFFF" strokeWidth={2.25} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 28 }} />
        )}
      </View>

      <View style={styles.listContainer}>
        {isLoading && isEmpty ? (
          <NotificationsSkeleton />
        ) : error && isEmpty ? (
          <View style={styles.loading}>
            <Text style={styles.errorText}>{t('error.loadFailed')}</Text>
          </View>
        ) : (
          <SectionList
            sections={sections}
            renderItem={renderItem}
            renderSectionHeader={renderSectionHeader}
            keyExtractor={(item) => item.groupKey}
            refreshControl={
              <RefreshControl
                refreshing={manualRefreshing}
                onRefresh={handleRefresh}
                tintColor="#FFF"
              />
            }
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.5}
            ListFooterComponent={renderFooter}
            ListEmptyComponent={renderEmpty}
            showsVerticalScrollIndicator={false}
            stickySectionHeadersEnabled={false}
            contentContainerStyle={isEmpty ? styles.emptyContainer : undefined}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerTitle: {
    color: '#FFFFFF',
  },
  listContainer: {
    flex: 1,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#111',
    marginHorizontal: 16,
  },
  emptyContainer: {
    flex: 1,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    color: '#FFF',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 18,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: '#888',
    fontFamily: 'Archivo_400Regular',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  errorText: {
    color: '#888',
    fontFamily: 'Archivo_400Regular',
    fontSize: 15,
  },
});
