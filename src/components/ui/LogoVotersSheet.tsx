import { useEffect, useState } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Avatar } from '@/components/ui/Avatar';
import { Text } from '@/components/ui/Text';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';

interface Voter {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
}

interface LogoVotersSheetProps {
  visible: boolean;
  logoId: string;
  type: 'likes' | 'dislikes';
  onClose: () => void;
}

export function LogoVotersSheet({
  visible,
  logoId,
  type,
  onClose,
}: LogoVotersSheetProps) {
  const [users, setUsers] = useState<Voter[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const title = type === 'likes' ? 'Liked by' : 'Disliked by';

  useEffect(() => {
    if (!visible || !logoId) return;
    setIsLoading(true);
    apiClient
      .get(API_ENDPOINTS.CREATOR_LOGOS.VOTERS(logoId, type))
      .then((res) => setUsers(res.data.data ?? []))
      .catch(() => setUsers([]))
      .finally(() => setIsLoading(false));
  }, [visible, logoId, type]);

  const handleUserPress = (userId: string) => {
    onClose();
    router.push({ pathname: '/user/[id]', params: { id: userId } });
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      {isLoading ? (
        <ActivityIndicator color="#FFF" style={styles.loader} />
      ) : users.length === 0 ? (
        <Text style={styles.empty}>No one yet</Text>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          style={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => handleUserPress(item.id)}
              activeOpacity={0.7}
            >
              <Avatar uri={item.avatar} size="sm" />
              <View style={styles.textCol}>
                <Text style={styles.displayName}>{item.displayName}</Text>
                <Text style={styles.username}>@{item.username}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  loader: { paddingVertical: 32 },
  empty: {
    color: '#888',
    fontFamily: 'Archivo_400Regular',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 24,
  },
  list: { maxHeight: 350 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  textCol: { flex: 1, gap: 1 },
  displayName: {
    color: '#FFF',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 14,
  },
  username: {
    color: '#888',
    fontFamily: 'Archivo_400Regular',
    fontSize: 12,
  },
});
