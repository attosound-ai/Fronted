import { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import type { PostAuthor } from '@/types/post';

interface PostHeaderProps {
  author: PostAuthor;
  onFollow?: (userId: number) => void;
  onProfilePress?: (userId: number) => void;
  onBookmark?: () => void;
  onReport?: () => void;
}

export function PostHeader({
  author,
  onFollow,
  onProfilePress,
  onBookmark,
  onReport,
}: PostHeaderProps) {
  const [menuVisible, setMenuVisible] = useState(false);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.authorInfo}
        onPress={() => onProfilePress?.(author.id)}
        activeOpacity={0.7}
      >
        <Avatar uri={author.avatar} size="sm" />
        <Text variant="body" style={styles.username}>
          {author.displayName.toUpperCase()}
        </Text>
        {author.isVerified && (
          <MaterialIcons name="verified" size={13} color="#3B82F6" />
        )}
      </TouchableOpacity>

      <View style={styles.spacer} />

      {!author.isFollowing && (
        <TouchableOpacity
          onPress={() => onFollow?.(author.id)}
          activeOpacity={0.7}
          style={styles.followButton}
        >
          <Text variant="body" style={styles.followText}>
            Follow
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        onPress={() => setMenuVisible(true)}
        activeOpacity={0.7}
        style={styles.optionsButton}
      >
        <Ionicons name="ellipsis-horizontal" size={20} color="#FFF" />
      </TouchableOpacity>

      <BottomSheet visible={menuVisible} onClose={() => setMenuVisible(false)}>
        <TouchableOpacity
          style={styles.menuItem}
          activeOpacity={0.7}
          onPress={() => {
            setMenuVisible(false);
            onBookmark?.();
          }}
        >
          <View style={styles.menuIcon}>
            <Ionicons name="bookmark-outline" size={24} color="#FFF" />
          </View>
          <Text variant="body" style={styles.menuText}>
            Save
          </Text>
        </TouchableOpacity>

        <View style={styles.menuDivider} />

        <TouchableOpacity
          style={styles.menuItem}
          activeOpacity={0.7}
          onPress={() => {
            setMenuVisible(false);
            onReport?.();
          }}
        >
          <View style={styles.menuIcon}>
            <Ionicons name="flag-outline" size={24} color="#EF4444" />
          </View>
          <Text variant="body" style={styles.menuTextDanger}>
            Report
          </Text>
        </TouchableOpacity>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  authorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  username: {
    color: '#FFF',
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 14,
  },
  followButton: {
    backgroundColor: '#333',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginRight: 8,
  },
  followText: {
    color: '#FFF',
    fontFamily: 'Poppins_700Bold',
    fontSize: 14,
  },
  spacer: {
    flex: 1,
  },
  optionsButton: {
    padding: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 14,
  },
  menuIcon: {
    width: 32,
    alignItems: 'center',
  },
  menuText: {
    color: '#FFF',
    fontSize: 16,
  },
  menuTextDanger: {
    color: '#EF4444',
    fontSize: 16,
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#222',
    marginHorizontal: 16,
  },
});
