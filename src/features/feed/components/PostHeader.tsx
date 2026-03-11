import { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useAuthStore } from '@/stores/authStore';
import type { PostAuthor, OnProfilePress } from '@/types/post';

interface PostHeaderProps {
  author: PostAuthor;
  isBookmarked?: boolean;
  onFollow?: (userId: number) => void;
  onProfilePress?: OnProfilePress;
  onBookmark?: () => void;
  onReport?: () => void;
  onDelete?: () => void;
}

export function PostHeader({
  author,
  isBookmarked,
  onFollow,
  onProfilePress,
  onBookmark,
  onReport,
  onDelete,
}: PostHeaderProps) {
  const { t } = useTranslation('feed');
  const [menuVisible, setMenuVisible] = useState(false);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const isOwnPost = currentUserId !== undefined && String(author.id) === String(currentUserId);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.authorInfo}
        onPress={() => onProfilePress?.(author)}
        activeOpacity={0.7}
      >
        <Avatar uri={author.avatar} size="sm" />
        <Text variant="body" style={styles.username}>
          {author.displayName.toUpperCase()}
        </Text>
        {author.isVerified && <MaterialIcons name="verified" size={13} color="#3B82F6" />}
      </TouchableOpacity>

      <View style={styles.spacer} />

      {!isOwnPost && !author.isFollowing && (
        <TouchableOpacity
          onPress={() => onFollow?.(author.id)}
          activeOpacity={0.7}
          style={styles.followButton}
        >
          <Text variant="body" style={styles.followText}>
            {t('post.followButton')}
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
            <Ionicons
              name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
              size={24}
              color="#FFF"
            />
          </View>
          <Text variant="body" style={styles.menuText}>
            {isBookmarked ? t('post.menuUnsave') : t('post.menuSave')}
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
            {t('post.menuReport')}
          </Text>
        </TouchableOpacity>

        {isOwnPost && (
          <>
            <View style={styles.menuDivider} />
            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => {
                setMenuVisible(false);
                onDelete?.();
              }}
            >
              <View style={styles.menuIcon}>
                <Ionicons name="trash-outline" size={24} color="#EF4444" />
              </View>
              <Text variant="body" style={styles.menuTextDanger}>
                Delete post
              </Text>
            </TouchableOpacity>
          </>
        )}
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
    fontFamily: 'Archivo_600SemiBold',
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
    fontFamily: 'Archivo_700Bold',
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
