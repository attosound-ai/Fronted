import { View, FlatList, TouchableOpacity, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { useAuthStore } from '@/stores/authStore';

interface FollowingUser {
  id: number;
  username: string;
  displayName: string;
  avatar: string | null;
  bio: string | null;
}

export default function FollowingScreen() {
  const currentUserId = useAuthStore((s) => s.user?.id);

  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEYS.USERS.FOLLOWING(Number(currentUserId)),
    queryFn: async () => {
      const res = await apiClient.get(API_ENDPOINTS.USERS.FOLLOWING(Number(currentUserId)));
      return (res.data?.data ?? res.data ?? []) as FollowingUser[];
    },
    enabled: !!currentUserId,
  });

  const users: FollowingUser[] = data ?? [];

  const renderUser = ({ item }: { item: FollowingUser }) => (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.7}
      onPress={() =>
        router.push({
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
      <Ionicons name="chevron-forward" size={18} color="#555" />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Following</Text>
        <View style={styles.backButton} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#FFF" size="large" />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Could not load following list</Text>
        </View>
      ) : users.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={48} color="#333" />
          <Text style={styles.emptyText}>You're not following anyone yet</Text>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#111',
  },
  backButton: {
    width: 36,
  },
  title: {
    color: '#FFF',
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
