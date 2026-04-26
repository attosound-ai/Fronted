import { useCallback } from 'react';
import { View, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { CreatorBadge } from '@/components/ui/CreatorBadge';
import { Logo } from '@/components/ui/Logo';
import { cloudinaryUrl } from '@/lib/media/cloudinaryUrl';
import type { GroupedNotification, NotificationType } from '../types';

interface Props {
  group: GroupedNotification;
  onMarkRead: (ids: string[]) => void;
}

function getTimeSince(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  const diffWeek = Math.floor(diffDay / 7);
  return `${diffWeek}w`;
}

function getI18nKey(type: NotificationType, count: number): string {
  if (type === 'welcome') return 'types.welcome';
  if (type === 'message') return count > 1 ? 'types.message_many' : 'types.message_one';
  if (count === 1) return `types.${type}_one`;
  if (count === 2) return `types.${type}_two`;
  return `types.${type}_many`;
}

function navigateForType(type: NotificationType, group: GroupedNotification) {
  switch (type) {
    case 'follow':
      router.navigate({
        pathname: '/user/[id]',
        params: {
          id: group.actors[0].id,
          username: group.actors[0].username,
          avatar: group.actors[0].avatar ?? '',
        },
      });
      break;
    case 'like':
    case 'comment':
    case 'repost':
    case 'share':
    case 'new_post':
      if (group.referenceId) {
        router.navigate({
          pathname: '/post/[id]',
          params: { id: group.referenceId },
        });
      }
      break;
    case 'message':
      if (group.referenceId) {
        router.push({
          pathname: '/(tabs)/messages',
          params: { chatId: group.referenceId },
        });
      }
      break;
    case 'welcome':
      break;
  }
}

export function NotificationRow({ group, onMarkRead }: Props) {
  const { t } = useTranslation('notifications');
  const { actors, count, type, isRead } = group;

  const handlePress = useCallback(() => {
    if (!isRead) {
      onMarkRead(group.notificationIds);
    }
    navigateForType(type, group);
  }, [isRead, type, group, onMarkRead]);

  // For messages, group count is number of messages from same actor
  // For others, it's the number of unique actors
  const groupSize = type === 'message' ? count : actors.length;
  const i18nKey = getI18nKey(type, groupSize);
  const i18nParams: Record<string, string | number> = {};

  if (actors.length >= 1) {
    i18nParams.actor = actors[0].username;
    i18nParams.actor1 = actors[0].username;
  }
  if (actors.length >= 2) {
    i18nParams.actor2 = actors[1].username;
  }
  if (type === 'message' && count > 1) {
    i18nParams.count = count;
  } else if (actors.length >= 3) {
    i18nParams.count = actors.length - 2;
  }

  const avatarUri = actors[0]?.avatar
    ? (cloudinaryUrl(actors[0].avatar, 'avatar_sm') ?? undefined)
    : undefined;
  const secondAvatarUri =
    actors.length >= 2 && actors[1]?.avatar
      ? (cloudinaryUrl(actors[1].avatar, 'avatar_sm') ?? undefined)
      : undefined;

  return (
    <TouchableOpacity
      style={[styles.container, !isRead && styles.unreadBg]}
      activeOpacity={0.7}
      onPress={handlePress}
    >
      <View style={styles.avatarContainer}>
        {actors[0]?.id === 'system' ? (
          <View style={styles.systemAvatar}>
            <Logo size={24} />
          </View>
        ) : (
          <>
            {actors.length >= 2 && (
              <View style={styles.secondAvatar}>
                <Avatar
                  uri={secondAvatarUri}
                  size="sm"
                  fallbackText={actors[1]?.username}
                />
              </View>
            )}
            <View style={actors.length >= 2 ? styles.firstAvatar : undefined}>
              <Avatar
                uri={avatarUri}
                size="sm"
                fallbackText={actors[0]?.username}
                creatorRing={actors[0]?.role === 'creator'}
              />
            </View>
          </>
        )}
      </View>

      <View style={styles.content}>
        <View style={styles.textRow}>
          <Text style={[styles.text, { flexShrink: 1 }]} numberOfLines={2}>
            {t(i18nKey, i18nParams)}
          </Text>
          {actors[0]?.role === 'creator' && <CreatorBadge size="sm" />}
        </View>
        <Text style={styles.time}>{getTimeSince(group.createdAt)}</Text>
      </View>

      {!isRead && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    backgroundColor: '#000',
  },
  unreadBg: {
    backgroundColor: '#0A0A0A',
  },
  avatarContainer: {
    width: 44,
    height: 32,
    justifyContent: 'center',
  },
  systemAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  firstAvatar: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 2,
  },
  secondAvatar: {
    position: 'absolute',
    top: 0,
    left: 14,
    zIndex: 1,
    opacity: 0.7,
  },
  content: {
    flex: 1,
    gap: 2,
  },
  textRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  text: {
    color: '#FFF',
    fontSize: 14,
    fontFamily: 'Archivo_400Regular',
    lineHeight: 20,
  },
  time: {
    color: '#666',
    fontSize: 12,
    fontFamily: 'Archivo_400Regular',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    marginLeft: 4,
  },
});
