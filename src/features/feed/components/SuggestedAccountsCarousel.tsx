import { View, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { useSuggestedAccounts } from '../hooks/useSuggestedAccounts';
import { useFollowFeed } from '../hooks/useFollowFeed';
import type { User } from '@/types';

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonBubble() {
  return (
    <View style={styles.bubble}>
      <View style={styles.avatarContainer}>
        <View style={styles.skeletonAvatar} />
      </View>
      <View style={styles.skeletonName} />
    </View>
  );
}

// ─── User bubble ──────────────────────────────────────────────────────────────

interface BubbleProps {
  user: User;
  isFollowing: boolean;
  onFollow: () => void;
}

function UserBubble({ user, isFollowing, onFollow }: BubbleProps) {
  const handleProfilePress = () => {
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
    <View style={styles.bubble}>
      <View style={styles.avatarContainer}>
        <TouchableOpacity onPress={handleProfilePress} activeOpacity={0.8} style={styles.avatarWrapper}>
          <Avatar uri={user.avatar} size="lg" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onFollow}
          activeOpacity={0.8}
          style={[styles.followBadge, isFollowing && styles.followingBadge]}
        >
          <Ionicons
            name={isFollowing ? 'checkmark' : 'add'}
            size={13}
            color={isFollowing ? '#888' : '#000'}
          />
        </TouchableOpacity>
      </View>

      <Text style={styles.username} numberOfLines={1}>
        {user.displayName}
      </Text>
    </View>
  );
}

// ─── Carousel ─────────────────────────────────────────────────────────────────

export function SuggestedAccountsCarousel() {
  const { users, isLoading } = useSuggestedAccounts();
  const { toggleFollow, getIsFollowing } = useFollowFeed();

  if (!isLoading && users.length === 0) return null;

  const skeletons = Array(5).fill(null);

  return (
    <View style={styles.container}>
      <FlatList
        horizontal
        data={isLoading ? skeletons : users}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        keyExtractor={(item: User | null, index) =>
          item ? String(item.id) : `skeleton-${index}`
        }
        renderItem={({ item }: { item: User | null }) => {
          if (!item) return <SkeletonBubble />;
          const isFollowing = getIsFollowing(item.id, item.isFollowing ?? false);
          return (
            <UserBubble
              user={item}
              isFollowing={isFollowing}
              onFollow={() => toggleFollow(item.id, isFollowing)}
            />
          );
        }}
      />

      <View style={styles.divider} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    paddingTop: 10,
  },
  list: {
    paddingHorizontal: 12,
    gap: 16,
    paddingBottom: 4,
  },
  bubble: {
    width: 76,
    alignItems: 'center',
    gap: 6,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatarWrapper: {
    borderWidth: 1.5,
    borderColor: '#2a2a2a',
    borderRadius: 36,
    padding: 2,
  },
  followBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  followingBadge: {
    backgroundColor: '#333',
    borderColor: '#000',
  },
  username: {
    fontSize: 11,
    color: '#999',
    fontFamily: 'Archivo_400Regular',
    width: 72,
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#111',
    marginTop: 10,
  },
  // Skeleton styles
  skeletonAvatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#111',
  },
  skeletonName: {
    width: 50,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#111',
  },
});
