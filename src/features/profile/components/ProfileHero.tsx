import { useState } from 'react';
import {
  View,
  TouchableOpacity,
  Modal,
  Image,
  Pressable,
  Linking,
  ScrollView,
  StyleSheet,
} from 'react-native';
import {
  X,
  Instagram,
  Music2,
  Youtube,
  Cloud,
  Disc3,
  Twitter,
  Globe,
  MapPin,
  Building2,
  Mail,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { CreatorBadge } from '@/components/ui/CreatorBadge';
import { GoldRing } from '@/components/ui/GoldRing';
import { Logo } from '@/components/ui/Logo';
import { GOLD_FLAT } from '@/constants/gold';
import { formatCount } from '@/utils/formatters';
import { cloudinaryUrl } from '@/lib/media/cloudinaryUrl';
import type { User } from '@/types';

interface ProfileHeroProps {
  user: User;
  onEditProfile?: () => void;
}

const SOCIAL_LINKS = [
  { key: 'socialInstagram', icon: Instagram, urlPrefix: 'https://instagram.com/' },
  { key: 'socialTiktok', icon: Music2, urlPrefix: 'https://tiktok.com/@' },
  { key: 'socialYoutube', icon: Youtube, urlPrefix: 'https://youtube.com/@' },
  { key: 'socialSoundcloud', icon: Cloud, urlPrefix: 'https://soundcloud.com/' },
  { key: 'socialSpotify', icon: Disc3, urlPrefix: 'https://open.spotify.com/search/' },
  { key: 'socialTwitter', icon: Twitter, urlPrefix: 'https://x.com/' },
  { key: 'website', icon: Globe, urlPrefix: '' },
  { key: 'bookingEmail', icon: Mail, urlPrefix: 'mailto:' },
] as const;

function SocialLinksRow({ user }: { user: User }) {
  const links = SOCIAL_LINKS.filter(
    (l) => user[l.key as keyof User] && String(user[l.key as keyof User]).trim()
  );
  if (links.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.socialRow}
      contentContainerStyle={styles.socialRowContent}
    >
      {links.map((link) => {
        const handle = String(user[link.key as keyof User]).replace(/^@/, '');
        const url = link.key === 'website' ? handle : link.urlPrefix + handle;
        return (
          <TouchableOpacity
            key={link.key}
            style={styles.socialIcon}
            onPress={() => Linking.openURL(url)}
            activeOpacity={0.6}
          >
            <link.icon size={18} color="#FFF" strokeWidth={2} />
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

export function ProfileHero({ user, onEditProfile }: ProfileHeroProps) {
  const { t } = useTranslation('profile');
  const [avatarModalVisible, setAvatarModalVisible] = useState(false);

  const navigateToList = (mode: 'followers' | 'following') => {
    router.push({
      pathname: '/following',
      params: { userId: String(user.id), mode },
    });
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={() => setAvatarModalVisible(true)}
        onLongPress={onEditProfile}
        activeOpacity={0.7}
        style={styles.avatarContainer}
      >
        {user.role === 'creator' ? (
          <GoldRing size={104} thickness={2}>
            <Avatar uri={user.avatar} size="xl" />
          </GoldRing>
        ) : (
          <View style={styles.avatarRing}>
            <Avatar uri={user.avatar} size="xl" />
          </View>
        )}
      </TouchableOpacity>

      {/* Avatar fullscreen modal */}
      <Modal
        visible={avatarModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAvatarModalVisible(false)}
      >
        <Pressable
          style={styles.avatarModal}
          onPress={() => setAvatarModalVisible(false)}
        >
          <TouchableOpacity
            style={styles.avatarModalClose}
            onPress={() => setAvatarModalVisible(false)}
            hitSlop={16}
          >
            <X size={28} color="#FFF" strokeWidth={2.25} />
          </TouchableOpacity>
          {user.avatar ? (
            <Image
              source={{ uri: cloudinaryUrl(user.avatar, 'avatar_lg') ?? user.avatar }}
              style={styles.avatarModalImage}
              resizeMode="contain"
            />
          ) : (
            <Logo size={200} />
          )}
        </Pressable>
      </Modal>

      <Text
        variant="h2"
        style={styles.name}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        @{user.username}
      </Text>

      {user.bio && (
        <Text variant="body" style={styles.bio}>
          {user.bio}
        </Text>
      )}

      {/* Location + Record Label badges */}
      {(user.location || user.recordLabel) && (
        <View style={styles.metaBadges}>
          {user.location && (
            <View style={styles.metaBadge}>
              <MapPin size={12} color="#888" strokeWidth={2} />
              <Text variant="caption" style={styles.metaBadgeText}>
                {user.location}
              </Text>
            </View>
          )}
          {user.recordLabel && (
            <View style={styles.metaBadge}>
              <Building2 size={12} color="#888" strokeWidth={2} />
              <Text variant="caption" style={styles.metaBadgeText}>
                {user.recordLabel}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Social links row */}
      <SocialLinksRow user={user} />

      {user.role !== 'listener' && (
        <View style={styles.badge}>
          <Text variant="caption" style={styles.badgeText}>
            {user.role === 'creator'
              ? t('hero.roleBadgeCreator')
              : t('hero.roleBadgeRepresentative')}
          </Text>
          {user.role === 'creator' && <CreatorBadge />}
        </View>
      )}

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text variant="h2">{formatCount(user.postsCount)}</Text>
          <Text
            variant="caption"
            style={styles.statLabel}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {t('hero.statPosts')}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.stat}
          activeOpacity={0.7}
          onPress={() => navigateToList('followers')}
        >
          <Text variant="h2">{formatCount(user.followersCount)}</Text>
          <Text
            variant="caption"
            style={styles.statLabel}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {t('hero.statFollowers')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.stat}
          activeOpacity={0.7}
          onPress={() => navigateToList('following')}
        >
          <Text variant="h2">{formatCount(user.followingCount)}</Text>
          <Text
            variant="caption"
            style={styles.statLabel}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {t('hero.statFollowing')}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        onPress={onEditProfile}
        activeOpacity={0.7}
        style={styles.editButton}
      >
        <Text variant="body" style={styles.editButtonText}>
          {t('hero.editProfile')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 8,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatarRing: {
    width: 100,
    height: 100,
    borderWidth: 2,
    borderColor: '#CCCCCC',
    borderRadius: 50,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRingCreator: {
    borderColor: GOLD_FLAT,
  },
  name: {
    marginTop: 8,
    paddingHorizontal: 32,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  username: {
    color: '#888',
  },
  bio: {
    color: '#888888',
    textAlign: 'center',
  },
  metaBadges: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaBadgeText: {
    color: '#888',
    fontSize: 12,
  },
  socialRow: {
    marginTop: 4,
    maxHeight: 40,
  },
  socialRowContent: {
    gap: 12,
    paddingHorizontal: 4,
  },
  socialIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  badgeText: {
    color: '#AAAAAA',
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
    marginTop: 8,
    gap: 40,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    color: '#888888',
  },
  editButton: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 9999,
    paddingVertical: 8,
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: 12,
  },
  editButtonText: {
    color: '#FFF',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 14,
  },
  avatarModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarModalClose: {
    position: 'absolute',
    top: 56,
    right: 20,
    zIndex: 10,
  },
  avatarModalImage: {
    width: 280,
    height: 280,
    borderRadius: 140,
  },
});
