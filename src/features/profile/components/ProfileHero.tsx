import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { formatCount } from '@/utils/formatters';
import type { User } from '@/types';

interface ProfileHeroProps {
  user: User;
  onEditProfile?: () => void;
}

export function ProfileHero({ user, onEditProfile }: ProfileHeroProps) {
  const { t } = useTranslation('profile');

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={onEditProfile}
        activeOpacity={0.7}
        style={styles.avatarContainer}
      >
        <Avatar uri={user.avatar} size="xl" />
        <View style={styles.avatarBadge}>
          <Ionicons name="camera" size={14} color="#000" />
        </View>
      </TouchableOpacity>

      <Text variant="h2" style={styles.name}>
        {(user.displayName || user.artistName || user.username).toUpperCase()}
      </Text>

      <Text variant="caption" style={styles.username}>
        @{user.username}
      </Text>

      {user.bio && (
        <Text variant="body" style={styles.bio}>
          {user.bio}
        </Text>
      )}

      {user.role !== 'listener' && (
        <View style={styles.badge}>
          <Text variant="caption" style={styles.badgeText}>
            {user.role === 'artist'
              ? t('hero.roleBadgeArtist')
              : t('hero.roleBadgeRepresentative')}
          </Text>
          {user.profileVerified && (
            <Ionicons name="checkmark-circle" size={14} color="#3B82F6" />
          )}
        </View>
      )}

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text variant="h2">{formatCount(user.postsCount)}</Text>
          <Text variant="caption" style={styles.statLabel}>
            {t('hero.statPosts')}
          </Text>
        </View>
        <View style={styles.stat}>
          <Text variant="h2">{formatCount(user.followersCount)}</Text>
          <Text variant="caption" style={styles.statLabel}>
            {t('hero.statFollowers')}
          </Text>
        </View>
        <View style={styles.stat}>
          <Text variant="h2">{formatCount(user.followingCount)}</Text>
          <Text variant="caption" style={styles.statLabel}>
            {t('hero.statFollowing')}
          </Text>
        </View>
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
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#000',
  },
  name: {
    marginTop: 8,
  },
  username: {
    color: '#888',
  },
  bio: {
    color: '#888888',
    textAlign: 'center',
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
    borderRadius: 8,
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
});
