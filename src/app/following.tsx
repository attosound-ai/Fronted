import {
  View,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CollapsibleHeader } from '@/components/ui/CollapsibleHeader';
import { useCollapsibleHeader } from '@/hooks/useCollapsibleHeader';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { UserListSkeleton } from '@/components/ui/Skeleton';
import { COLORS } from '@/constants/theme';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';

interface FollowingUser {
  id: number;
  username: string;
  displayName: string;
  avatar: string | null;
  bio: string | null;
}

/**
 * The social service pages this list (default 20, max 100). The screen used to
 * fetch once with no page or limit, so a profile with 48 followers rendered 20
 * and looked broken ("it says 48 but I don't see 48", Sep 2026). Now it walks
 * every page with an infinite query and reports each page to PostHog.
 */
const PAGE_SIZE = 50;

interface FollowPage {
  users: FollowingUser[];
  page: number;
  serverTotal: number | null;
  totalPages: number | null;
}

export default function FollowingScreen() {
  const { t } = useTranslation('profile');
  const { userId, mode } = useLocalSearchParams<{
    userId?: string;
    mode?: 'followers' | 'following';
  }>();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const targetId = userId ? Number(userId) : Number(currentUserId);
  const activeMode = mode ?? 'following';
  const title =
    activeMode === 'followers'
      ? t('followList.titleFollowers')
      : t('followList.titleFollowing');

  const header = useCollapsibleHeader();

  const { data, isLoading, isError, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useInfiniteQuery({
      // Suffixed so a persisted cache from the old single array shape is never
      // read back as pages.
      queryKey: [
        ...(activeMode === 'followers'
          ? QUERY_KEYS.USERS.FOLLOWERS(targetId)
          : QUERY_KEYS.USERS.FOLLOWING(targetId)),
        'paged',
      ],
      initialPageParam: 1,
      queryFn: async ({ pageParam }): Promise<FollowPage> => {
        const endpoint =
          activeMode === 'followers'
            ? API_ENDPOINTS.USERS.FOLLOWERS(targetId)
            : API_ENDPOINTS.USERS.FOLLOWING(targetId);
        const res = await apiClient.get(endpoint, {
          params: { page: pageParam, limit: PAGE_SIZE },
        });
        const body = res.data ?? {};
        const users = (
          Array.isArray(body.data) ? body.data : Array.isArray(body) ? body : []
        ) as FollowingUser[];
        const pagination = body.meta?.pagination ?? null;
        const serverTotal = typeof pagination?.total === 'number' ? pagination.total : null;
        const totalPages =
          typeof pagination?.totalPages === 'number' ? pagination.totalPages : null;
        const hasMore =
          totalPages != null ? pageParam < totalPages : users.length >= PAGE_SIZE;
        analytics.capture(ANALYTICS_EVENTS.SOCIAL.FOLLOW_LIST_PAGE, {
          mode: activeMode,
          target_id: targetId,
          page: pageParam,
          page_size: PAGE_SIZE,
          received: users.length,
          server_total: serverTotal,
          total_pages: totalPages,
          has_more: hasMore,
        });
        return { users, page: pageParam, serverTotal, totalPages };
      },
      getNextPageParam: (last) => {
        if (last.totalPages != null) {
          return last.page < last.totalPages ? last.page + 1 : undefined;
        }
        return last.users.length >= PAGE_SIZE ? last.page + 1 : undefined;
      },
      enabled: targetId > 0,
    });

  // Flatten and dedupe by id: a follow that lands between two page fetches can
  // shift the offsets and repeat a row, which FlatList would warn about.
  const users: FollowingUser[] = [];
  const seen = new Set<number>();
  for (const page of data?.pages ?? []) {
    for (const u of page.users) {
      if (!seen.has(u.id)) {
        seen.add(u.id);
        users.push(u);
      }
    }
  }

  const renderUser = ({ item }: { item: FollowingUser }) => (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.7}
      onPress={() =>
        router.navigate({
          pathname: '/user/[id]',
          params: {
            id: String(item.id),
            username: item.username,
            avatar: item.avatar ?? '',
          },
        })
      }
    >
      <Avatar uri={item.avatar} size="md" fallbackText={item.username} />
      <View style={styles.info}>
        <Text style={styles.username}>{item.username}</Text>
      </View>
      <ChevronRight size={18} color="#555" strokeWidth={2.25} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {isLoading ? (
        <UserListSkeleton />
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>{t('followList.errorLoad')}</Text>
        </View>
      ) : users.length === 0 ? (
        <View style={styles.center}>
          <Users size={48} color="#333" strokeWidth={2.25} />
          <Text style={styles.emptyText}>
            {activeMode === 'followers'
              ? t('followList.emptyFollowers')
              : t('followList.emptyFollowing')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={users}
          renderItem={renderUser}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[styles.list, { paddingTop: header.height }]}
          showsVerticalScrollIndicator={false}
          onScroll={header.onScroll}
          scrollEventThrottle={header.scrollEventThrottle}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) fetchNextPage();
          }}
          ListFooterComponent={
            isFetchingNextPage ? (
              <ActivityIndicator color="#555" style={styles.footer} />
            ) : null
          }
        />
      )}

      <CollapsibleHeader animatedStyle={header.animatedStyle}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ChevronLeft size={28} color="#FFFFFF" strokeWidth={2.25} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={{ width: 28 }} />
      </CollapsibleHeader>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background.primary,
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
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 17,
  },
  list: {
    paddingTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  info: {
    flex: 1,
  },
  username: {
    color: '#FFF',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 15,
  },
  separator: {
    height: 1,
    backgroundColor: '#111',
    marginHorizontal: 16,
  },
  footer: {
    paddingVertical: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    color: '#555',
    fontFamily: 'Archivo_400Regular',
    fontSize: 15,
  },
});
