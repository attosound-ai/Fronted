import { View, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Check, Plus } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { CreatorBadge } from '@/components/ui/CreatorBadge';
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
    <View style={styles.bubble}>
      <View style={styles.avatarContainer}>
        <TouchableOpacity
          onPress={handleProfilePress}
          activeOpacity={0.8}
          style={[
            styles.avatarWrapper,
            user.role === 'creator' && styles.avatarWrapperCreator,
          ]}
        >
          <Avatar uri={user.avatar} size="lg" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onFollow}
          activeOpacity={0.8}
          style={[styles.followBadge, isFollowing && styles.followingBadge]}
        >
          {isFollowing ? (
            <Check size={13} color="#888" strokeWidth={2.25} />
          ) : (
            <Plus size={13} color="#000" strokeWidth={2.25} />
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.nameRow}>
        <Text
          style={styles.username}
          numberOfLines={1}
          maxFontSizeMultiplier={1.0}
          allowFontScaling={false}
        >
          {user.username}
        </Text>
        {user.role === 'creator' && <CreatorBadge size="sm" />}
      </View>
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
        nestedScrollEnabled
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
    borderRadius: 32,
  },
  avatarWrapperCreator: {
    borderWidth: 2,
    borderColor: '#D4AF37',
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
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    width: 76,
  },
  username: {
    fontSize: 11,
    color: '#999',
    fontFamily: 'Archivo_400Regular',
    flexShrink: 1,
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
