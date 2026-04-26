import { useCallback, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { Ellipsis, Bookmark, Flag, Pencil, Trash2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { CreatorBadge } from '@/components/ui/CreatorBadge';
import { useAuthStore } from '@/stores/authStore';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { PostAuthor, OnProfilePress } from '@/types/post';

interface PostHeaderProps {
  author: PostAuthor;
  isBookmarked?: boolean;
  onFollow?: (userId: number) => void;
  onProfilePress?: OnProfilePress;
  onBookmark?: () => void;
  onReport?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function PostHeader({
  author,
  isBookmarked,
  onFollow,
  onProfilePress,
  onBookmark,
  onReport,
  onEdit,
  onDelete,
}: PostHeaderProps) {
  const { t } = useTranslation('feed');
  const [menuVisible, setMenuVisible] = useState(false);
  const currentUserId = useAuthStore((s) => s.user?.id);
  // Cap fontScale to 1.2 so the Follow button grows with the text but stays
  // bounded — keeps padding proportional even at AX5 accessibility sizes.
  const { fontScale } = useWindowDimensions();
  const cappedFontScale = Math.min(fontScale, 1.2);
  const isOwnPost =
    currentUserId !== undefined && String(author.id) === String(currentUserId);
  const qc = useQueryClient();

  // Prefetch profile + stats on finger-down (before tap completes ~100-200ms later)
  const handlePressIn = useCallback(() => {
    if (isOwnPost) return;
    const id = Number(author.id);
    qc.prefetchQuery({
      queryKey: QUERY_KEYS.USERS.PROFILE(id),
      queryFn: async () => {
        const [profileRes, statsRes] = await Promise.all([
          apiClient.get(API_ENDPOINTS.USERS.PROFILE(id)),
          apiClient.get(API_ENDPOINTS.USERS.STATS(id)),
        ]);
        const profile = profileRes.data.data;
        const stats = statsRes.data?.data;
        if (stats) {
          profile.followersCount = stats.followersCount;
          profile.followingCount = stats.followingCount;
          profile.postsCount = stats.postsCount;
        }
        return profile;
      },
      staleTime: 5 * 60 * 1000,
    });
  }, [author.id, isOwnPost, qc]);

  return (
    <View>
      {!isOwnPost && !author.isFollowing && (
        <Text variant="small" style={styles.suggestedLabel} maxFontSizeMultiplier={1.0}>
          {t('post.suggestedForYou')}
        </Text>
      )}
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.authorInfo}
          onPressIn={handlePressIn}
          onPress={() => onProfilePress?.(author)}
          activeOpacity={0.7}
        >
          <Avatar uri={author.avatar} size="md" creatorRing={author.role === 'creator'} />
          <Text
            variant="body"
            style={styles.username}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            maxFontSizeMultiplier={1.0}
          >
            {author.username}
          </Text>
          {author.role === 'creator' && <CreatorBadge size="sm" />}
        </TouchableOpacity>

        <View style={styles.spacer} />

        {!isOwnPost && !author.isFollowing && (
          <TouchableOpacity
            onPress={() => onFollow?.(author.id)}
            activeOpacity={0.7}
            style={[
              styles.followButton,
              {
                paddingHorizontal: 10 * cappedFontScale,
                paddingVertical: 4 * cappedFontScale,
              },
            ]}
          >
            <Text variant="body" style={styles.followText} maxFontSizeMultiplier={1.2}>
              {t('post.followButton')}
            </Text>
          </TouchableOpacity>
        )}

        {!isOwnPost && author.isFollowing && (
          <Text variant="small" style={styles.feedLabel}>
            {t('post.following')}
          </Text>
        )}

        <TouchableOpacity
          onPress={() => setMenuVisible(true)}
          activeOpacity={0.7}
          style={styles.optionsButton}
        >
          <Ellipsis size={22} color="#FFF" strokeWidth={2.25} />
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
              <Bookmark
                size={24}
                color="#FFF"
                strokeWidth={2.25}
                fill={isBookmarked ? '#FFF' : 'none'}
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
              <Flag size={24} color="#EF4444" strokeWidth={2.25} />
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
                  onEdit?.();
                }}
              >
                <View style={styles.menuIcon}>
                  <Pencil size={24} color="#FFF" strokeWidth={2.25} />
                </View>
                <Text variant="body" style={styles.menuText}>
                  Edit post
                </Text>
              </TouchableOpacity>
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
                  <Trash2 size={24} color="#EF4444" strokeWidth={2.25} />
                </View>
                <Text variant="body" style={styles.menuTextDanger}>
                  Delete post
                </Text>
              </TouchableOpacity>
            </>
          )}
        </BottomSheet>
      </View>
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
  suggestedLabel: {
    color: '#888888',
    fontSize: 11,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
  },
  feedLabel: {
    color: '#888888',
    fontFamily: 'Archivo_700Bold',
    fontSize: 14,
    marginRight: 8,
  },
  username: {
    color: '#FFF',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 15,
  },
  followButton: {
    backgroundColor: '#333',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 8,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  followText: {
    color: '#FFF',
    fontFamily: 'Archivo_700Bold',
    fontSize: 13,
    lineHeight: 16,
    includeFontPadding: false,
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
