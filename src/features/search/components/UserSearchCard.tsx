import { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import type { User } from '@/types';

interface UserSearchCardProps {
  user: User;
}

export function UserSearchCard({ user }: UserSearchCardProps) {
  const [isFollowing, setIsFollowing] = useState(user.isFollowing ?? false);
  const [isToggling, setIsToggling] = useState(false);

  const handleFollow = async () => {
    setIsToggling(true);
    const prev = isFollowing;
    setIsFollowing(!prev);
    try {
      await apiClient.post(API_ENDPOINTS.USERS.FOLLOW(user.id));
    } catch {
      setIsFollowing(prev);
    } finally {
      setIsToggling(false);
    }
  };

  const handlePress = () => {
    router.push({
      pathname: '/user/[id]',
      params: {
        id: String(user.id),
        displayName: user.displayName,
        username: user.username,
        avatar: user.avatar ?? '',
      },
    });
  };

  return (
    <TouchableOpacity style={styles.container} onPress={handlePress} activeOpacity={0.7}>
      <Avatar uri={user.avatar} size="md" />

      <View style={styles.info}>
        <Text variant="body" style={styles.displayName} numberOfLines={1}>
          {user.displayName}
        </Text>
        <Text variant="caption" style={styles.username} numberOfLines={1}>
          @{user.username}
        </Text>
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
            {!isFollowing && <Ionicons name="add" size={14} color="#000" />}
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
  displayName: {
    color: '#FFF',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 14,
  },
  username: {
    color: '#888',
    fontSize: 12,
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
