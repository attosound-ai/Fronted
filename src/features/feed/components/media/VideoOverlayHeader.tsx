import { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ellipsis, Bookmark, Flag, Trash2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/ui/Avatar';
import { CreatorBadge } from '@/components/ui/CreatorBadge';
import { Text } from '@/components/ui/Text';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useAuthStore } from '@/stores/authStore';
import type { FeedPost, PostAuthor } from '@/types/post';

interface VideoOverlayHeaderProps {
  post: FeedPost;
  onProfilePress?: (author: PostAuthor) => void;
  onFollow?: (userId: number) => void;
  onBookmark?: () => void;
  onReport?: () => void;
  onDelete?: () => void;
}

/**
 * VideoOverlayHeader — the author row (avatar · username · follow · ⋯ menu) drawn
 * INSIDE a video at the top edge, over a dark top gradient so it stays legible
 * against any footage. Shared by full-screen reels (ReelMedia) and vertical
 * (~9:16) videos in the home feed (VideoMedia).
 *
 * Render this AFTER any full-bleed tap layer so its touchables capture their
 * taps first.
 */
export function VideoOverlayHeader({
  post,
  onProfilePress,
  onFollow,
  onBookmark,
  onReport,
  onDelete,
}: VideoOverlayHeaderProps) {
  const { t } = useTranslation('feed');
  const currentUserId = useAuthStore((s) => s.user?.id);
  const isOwnPost =
    currentUserId !== undefined && String(post.author.id) === String(currentUserId);
  const [menuVisible, setMenuVisible] = useState(false);

  return (
    <>
      {/* Top gradient — author info + follow + menu (the "juego de luces") */}
      <LinearGradient
        colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0.25)', 'transparent']}
        locations={[0, 0.55, 1]}
        style={styles.topGradient}
      >
        <TouchableOpacity
          style={styles.authorRow}
          onPress={() => onProfilePress?.(post.author)}
          activeOpacity={0.7}
        >
          <Avatar
            uri={post.author.avatar}
            size="md"
            creatorRing={post.author.role === 'creator'}
            fallbackText={post.author.username}
          />
          <Text style={styles.authorName} numberOfLines={1} maxFontSizeMultiplier={1.15}>
            {post.author.username}
          </Text>
          {post.author.role === 'creator' && <CreatorBadge />}
        </TouchableOpacity>

        <View style={styles.spacer} />

        {!isOwnPost && !post.author.isFollowing && (
          <TouchableOpacity
            style={styles.followButton}
            onPress={() => onFollow?.(post.author.id)}
            activeOpacity={0.7}
          >
            <Text style={styles.followText} maxFontSizeMultiplier={1.0}>
              {t('post.followButton')}
            </Text>
          </TouchableOpacity>
        )}

        {!isOwnPost && post.author.isFollowing && (
          <Text
            style={styles.followingLabel}
            numberOfLines={1}
            maxFontSizeMultiplier={1.0}
          >
            {t('post.following')}
          </Text>
        )}

        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => setMenuVisible(true)}
          activeOpacity={0.7}
          hitSlop={8}
        >
          <Ellipsis size={22} color="#FFF" strokeWidth={2.25} />
        </TouchableOpacity>
      </LinearGradient>

      {/* Options bottom sheet */}
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
              fill={post.isBookmarked ? '#FFF' : 'none'}
            />
          </View>
          <Text style={styles.menuText} maxFontSizeMultiplier={1.2}>
            {post.isBookmarked ? t('post.menuUnsave') : t('post.menuSave')}
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
          <Text style={styles.menuTextDanger} maxFontSizeMultiplier={1.2}>
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
                <Trash2 size={24} color="#EF4444" strokeWidth={2.25} />
              </View>
              <Text style={styles.menuTextDanger} maxFontSizeMultiplier={1.2}>
                Delete post
              </Text>
            </TouchableOpacity>
          </>
        )}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 28,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  authorName: {
    color: '#FFF',
    fontSize: 15,
    fontFamily: 'Archivo_600SemiBold',
    // Soft drop shadow so the name reads over bright footage.
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  followingLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    marginHorizontal: 16,
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  spacer: {
    flex: 1,
  },
  followButton: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginRight: 10,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  followText: {
    color: '#FFF',
    fontSize: 12,
    fontFamily: 'Archivo_600SemiBold',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  menuButton: {
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
    fontFamily: 'Archivo_400Regular',
  },
  menuTextDanger: {
    color: '#EF4444',
    fontSize: 16,
    fontFamily: 'Archivo_400Regular',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#222',
    marginHorizontal: 16,
  },
});
