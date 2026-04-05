import { View, Image, StyleSheet } from 'react-native';
import { User } from 'lucide-react-native';
import { Text } from './Text';
import { cloudinaryUrl } from '@/lib/media/cloudinaryUrl';
import { formatCount } from '@/utils/formatters';

interface ProfilePreviewCardProps {
  displayName: string;
  username?: string | null;
  avatarSource?: string | null;
  bio?: string | null;
  stats?: { posts: number; followers: number; following: number };
  role?: 'creator' | 'representative' | 'listener';
  verified?: boolean;
}

/**
 * Resolve avatar source to a renderable URI.
 * - file:// URIs (local picker): pass through
 * - http(s):// URLs: pass through
 * - Cloudinary public_id: resolve via cloudinaryUrl
 * - null/undefined: return null (placeholder)
 */
function resolveAvatarUri(source: string | null | undefined): string | null {
  if (!source) return null;
  if (source.startsWith('file://') || source.startsWith('http')) return source;
  return cloudinaryUrl(source, 'avatar_lg');
}

/**
 * ProfilePreviewCard — Reusable profile preview card.
 *
 * Single Responsibility: Only renders a profile preview. No modals, no fetch.
 * Open/Closed: Extensible via optional props without modifying internals.
 */
export function ProfilePreviewCard({
  displayName,
  username,
  avatarSource,
  bio,
  stats = { posts: 0, followers: 0, following: 0 },
  role,
  verified = false,
}: ProfilePreviewCardProps) {
  const resolvedUri = resolveAvatarUri(avatarSource);
  const normalizedUsername = username?.startsWith('@')
    ? username
    : username
      ? `@${username}`
      : null;

  return (
    <View style={styles.card}>
      {/* Cover band */}
      <View style={styles.cover} />

      {/* Avatar */}
      {resolvedUri ? (
        <Image source={{ uri: resolvedUri }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <User size={32} color="#666666" strokeWidth={2.25} />
        </View>
      )}

      {/* Name */}
      <Text variant="h2" style={styles.name}>
        {displayName || 'Your Name'}
      </Text>

      {/* Username */}
      {normalizedUsername && (
        <Text variant="caption" style={styles.username}>
          {normalizedUsername}
        </Text>
      )}

      {/* Bio */}
      {bio && (
        <Text variant="body" style={styles.bio} numberOfLines={2}>
          {bio}
        </Text>
      )}

      {/* Role badge */}
      {role && role !== 'listener' && (
        <Text variant="caption" style={styles.role}>
          {role === 'creator' ? 'Creator' : 'Representative'}
          {verified ? ' \u2713' : ''}
        </Text>
      )}

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text variant="h3" style={styles.statValue}>
            {formatCount(stats.posts)}
          </Text>
          <Text variant="caption" style={styles.statLabel}>
            Posts
          </Text>
        </View>
        <View style={styles.stat}>
          <Text variant="h3" style={styles.statValue}>
            {formatCount(stats.followers)}
          </Text>
          <Text variant="caption" style={styles.statLabel}>
            Followers
          </Text>
        </View>
        <View style={styles.stat}>
          <Text variant="h3" style={styles.statValue}>
            {formatCount(stats.following)}
          </Text>
          <Text variant="caption" style={styles.statLabel}>
            Following
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  cover: {
    width: '100%',
    height: 80,
    backgroundColor: '#111111',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginTop: -40,
    borderWidth: 3,
    borderColor: '#1A1A1A',
    backgroundColor: '#222222',
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#333333',
  },
  name: {
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 12,
  },
  username: {
    color: '#888888',
    textAlign: 'center',
    marginTop: 2,
  },
  bio: {
    color: '#AAAAAA',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 16,
  },
  role: {
    color: '#888888',
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 20,
    paddingHorizontal: 16,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    color: '#FFFFFF',
  },
  statLabel: {
    color: '#888888',
    marginTop: 2,
  },
});
