import {
  View,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { UserListSkeleton } from '@/components/ui/Skeleton';

interface FollowingUser {
  id: number;
  username: string;
  displayName: string;
  avatar: string | null;
  bio: string | null;
}

export default function FollowingScreen() {
  const { userId, mode } = useLocalSearchParams<{
    userId?: string;
    mode?: 'followers' | 'following';
  }>();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const targetId = userId ? Number(userId) : Number(currentUserId);
  const activeMode = mode ?? 'following';
  const title = activeMode === 'followers' ? 'Followers' : 'Following';

  const { data, isLoading, isError } = useQuery({
    queryKey:
      activeMode === 'followers'
        ? QUERY_KEYS.USERS.FOLLOWERS(targetId)
        : QUERY_KEYS.USERS.FOLLOWING(targetId),
    queryFn: async () => {
      const endpoint =
        activeMode === 'followers'
          ? API_ENDPOINTS.USERS.FOLLOWERS(targetId)
          : API_ENDPOINTS.USERS.FOLLOWING(targetId);
      const res = await apiClient.get(endpoint);
      return (res.data?.data ?? res.data ?? []) as FollowingUser[];
    },
    enabled: targetId > 0,
  });

  const users: FollowingUser[] = data ?? [];

  const renderUser = ({ item }: { item: FollowingUser }) => (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.7}
      onPress={() =>
        router.navigate({
          pathname: '/user/[id]',
          params: {
            id: String(item.id),
            displayName: item.displayName,
            username: item.username,
            avatar: item.avatar ?? '',
          },
        })
      }
    >
      <Avatar uri={item.avatar} size="md" />
      <View style={styles.info}>
        <Text style={styles.displayName}>{item.displayName}</Text>
        <Text style={styles.username}>@{item.username}</Text>
      </View>
      <ChevronRight size={18} color="#555" strokeWidth={2.25} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ChevronLeft size={28} color="#FFFFFF" strokeWidth={2.25} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={{ width: 28 }} />
      </View>
      {isLoading ? (
        <UserListSkeleton />
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Could not load following list</Text>
        </View>
      ) : users.length === 0 ? (
        <View style={styles.center}>
          <Users size={48} color="#333" strokeWidth={2.25} />
          <Text style={styles.emptyText}>
            {activeMode === 'followers'
              ? 'No followers yet'
              : "You're not following anyone yet"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={users}
          renderItem={renderUser}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
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
  displayName: {
    color: '#FFF',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 15,
  },
  username: {
    color: '#666',
    fontFamily: 'Archivo_400Regular',
    fontSize: 13,
    marginTop: 2,
  },
  separator: {
    height: 1,
    backgroundColor: '#111',
    marginHorizontal: 16,
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
