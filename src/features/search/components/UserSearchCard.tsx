import { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { CreatorBadge } from '@/components/ui/CreatorBadge';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { useFollowStore } from '@/stores/followStore';
import type { User } from '@/types';

interface UserSearchCardProps {
  user: User;
}

export function UserSearchCard({ user }: UserSearchCardProps) {
  const { setFollowed, getIsFollowing } = useFollowStore();
  const isFollowing = getIsFollowing(user.id, user.isFollowing ?? false);
  const [isToggling, setIsToggling] = useState(false);

  const handleFollow = async () => {
    setIsToggling(true);
    const prev = isFollowing;
    setFollowed(user.id, !prev);
    try {
      if (prev) {
        await apiClient.delete(API_ENDPOINTS.USERS.FOLLOW(user.id));
      } else {
        await apiClient.post(API_ENDPOINTS.USERS.FOLLOW(user.id));
      }
    } catch {
      setFollowed(user.id, prev);
    } finally {
      setIsToggling(false);
    }
  };

  const handlePress = () => {
    router.navigate({
      pathname: '/user/[id]',
      params: {
        id: String(user.id),
        username: user.username,
        avatar: user.avatar ?? '',
      },
    });
  };

  return (
    <TouchableOpacity style={styles.container} onPress={handlePress} activeOpacity={0.7}>
      <Avatar uri={user.avatar} size="md" creatorRing={user.role === 'creator'} />

      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text variant="body" style={styles.username} numberOfLines={1}>
            {user.username}
          </Text>
          {user.role === 'creator' && <CreatorBadge size="sm" />}
        </View>
      </View>

      <TouchableOpacity
        style={[styles.followButton, isFollowing && styles.followingButton]}
        onPress={handleFollow}
        disabled={isToggling}
        activeOpacity={0.7}
      >
        {isToggling ? (
          <ActivityIndicator size="small" color={isFollowing ? '#FFF' : '#000'} />
        ) : (
          <>
            {!isFollowing && <Plus size={14} color="#000" strokeWidth={2.25} />}
            <Text style={[styles.followText, isFollowing && styles.followingText]}>
              {isFollowing ? 'Following' : 'Follow'}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  username: {
    color: '#FFF',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 14,
  },
  followButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    gap: 4,
    minWidth: 80,
    justifyContent: 'center',
  },
  followingButton: {
    backgroundColor: '#222',
    borderWidth: 1,
    borderColor: '#444',
  },
  followText: {
    color: '#000',
    fontSize: 13,
    fontFamily: 'Archivo_600SemiBold',
  },
  followingText: {
    color: '#FFF',
  },
});
