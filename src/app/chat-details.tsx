import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  Bell,
  BellOff,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Phone,
  Pin,
  UserRound,
} from 'lucide-react-native';

import { COLORS } from '@/constants/theme';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { haptic } from '@/lib/haptics/hapticService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { cloudinaryUrl } from '@/lib/media/cloudinaryUrl';
import { makeVoIPCall } from '@/hooks/useTwilioVoice';
import { useChat } from '@/features/messages/hooks/useChat';
import { usePinnedMessages } from '@/features/messages/hooks/usePinnedMessages';
import { useParticipantProfile } from '@/features/messages/hooks/useParticipantAvatar';
import { useConversationPrefsStore } from '@/features/messages/stores/conversationPrefsStore';
import { WallpaperPickerSheet } from '@/features/messages/components/WallpaperPickerSheet';
import { isVisualContentType } from '@/features/messages/media/chatMedia';

/**
 * What Telegram and WhatsApp show when you tap the name at the top of a chat:
 * the person and the conversation, not a social profile (David, Sep 24 2026:
 * ours opened the posts grid, theirs opens the chat itself). The face and the
 * name, a row of the actions you reach for from inside a chat, the media this
 * conversation holds, what is pinned in it, its wallpaper and its
 * notifications; the public profile is one row away.
 */
export default function ChatDetailsScreen() {
  const { t } = useTranslation('messages');
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    conversationId: string;
    participantId?: string;
    participantName?: string;
  }>();
  const conversationId = String(params.conversationId ?? '');
  const participantId = String(params.participantId ?? '');
  const { avatarUri, username, role } = useParticipantProfile(participantId);
  const name = username || params.participantName || t('conversation.fallbackUserName');
  const { messages } = useChat(conversationId);
  const { pinned } = usePinnedMessages(conversationId);
  const muted = useConversationPrefsStore((s) => s.muted[conversationId] === true);
  const toggleMuted = useConversationPrefsStore((s) => s.toggleMuted);
  const [wallpaperVisible, setWallpaperVisible] = useState(false);

  /** Every picture and video this conversation has loaded, newest first. */
  const media = useMemo(
    () =>
      messages
        // A media message carries its url as the content, the way the chat
        // renders it (MediaMessage reads message.text).
        .filter((m) => isVisualContentType(m.contentType) && !!m.content)
        .slice(0, 12),
    [messages]
  );

  const roleLabel = useMemo(() => {
    if (role === 'creator') return t('details.roleCreator', { defaultValue: 'Creator' });
    if (role === 'representative')
      return t('details.roleRepresentative', { defaultValue: 'Representative' });
    return t('details.roleListener', { defaultValue: 'Listener' });
  }, [role, t]);

  const openProfile = useCallback(() => {
    analytics.capture(ANALYTICS_EVENTS.MESSAGES.HEADER_PROFILE_OPENED, {
      participant_id: participantId,
      surface: 'details',
    });
    router.push({
      pathname: '/user/[id]',
      params: { id: participantId, username: name, avatar: avatarUri ?? '' },
    });
  }, [avatarUri, name, participantId]);

  const action = useCallback(
    (key: string, run: () => void) => () => {
      void haptic('selection');
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.DETAILS_ACTION, {
        conversation_id: conversationId,
        action: key,
      });
      run();
    },
    [conversationId]
  );

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 32 },
        ]}
      >
        <View style={styles.hero}>
          <Avatar
            uri={avatarUri}
            size="xl"
            fallbackText={name}
            creatorRing={role === 'creator'}
          />
          <Text style={styles.name} numberOfLines={1}>
            @{name}
          </Text>
          <Text style={styles.role}>{roleLabel}</Text>
        </View>

        {/* Telegram's row of round actions, in ATTO's black and white. */}
        <View style={styles.actions}>
          <Pressable
            style={styles.actionChip}
            onPress={action('call', () => makeVoIPCall(participantId, name))}
            accessibilityRole="button"
            accessibilityLabel={t('details.call', { defaultValue: 'Call' })}
          >
            <Phone size={20} color={COLORS.white} strokeWidth={2.25} />
            <Text style={styles.actionText}>
              {t('details.call', { defaultValue: 'Call' })}
            </Text>
          </Pressable>
          <Pressable
            style={styles.actionChip}
            onPress={action('mute', () => toggleMuted(conversationId))}
            accessibilityRole="button"
            accessibilityState={{ selected: muted }}
            accessibilityLabel={
              muted
                ? t('details.unmute', { defaultValue: 'Unmute' })
                : t('details.mute', { defaultValue: 'Mute' })
            }
          >
            {muted ? (
              <BellOff size={20} color={COLORS.white} strokeWidth={2.25} />
            ) : (
              <Bell size={20} color={COLORS.white} strokeWidth={2.25} />
            )}
            <Text style={styles.actionText}>
              {muted
                ? t('details.unmute', { defaultValue: 'Unmute' })
                : t('details.mute', { defaultValue: 'Mute' })}
            </Text>
          </Pressable>
          <Pressable
            style={styles.actionChip}
            onPress={action('wallpaper', () => setWallpaperVisible(true))}
            accessibilityRole="button"
            accessibilityLabel={t('chatHeader.menuWallpaper')}
          >
            <ImageIcon size={20} color={COLORS.white} strokeWidth={2.25} />
            <Text style={styles.actionText}>{t('chatHeader.menuWallpaper')}</Text>
          </Pressable>
          <Pressable
            style={styles.actionChip}
            onPress={action('profile', openProfile)}
            accessibilityRole="button"
            accessibilityLabel={t('chatHeader.menuViewProfile')}
          >
            <UserRound size={20} color={COLORS.white} strokeWidth={2.25} />
            <Text style={styles.actionText}>
              {t('details.profile', { defaultValue: 'Profile' })}
            </Text>
          </Pressable>
        </View>

        {media.length > 0 ? (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>
                {t('details.media', { defaultValue: 'Media' })}
              </Text>
              <Text style={styles.cardCount}>{media.length}</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.mediaStrip}
            >
              {media.map((m) => (
                <Image
                  key={m.messageId}
                  source={{ uri: cloudinaryUrl(m.content, 'post_thumb') ?? m.content }}
                  style={styles.mediaThumb}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.card}>
          <Pressable
            style={styles.row}
            onPress={action('pinned', () => router.back())}
            accessibilityRole="button"
            accessibilityLabel={t('pinned.title', { defaultValue: 'Pinned' })}
          >
            <Pin size={18} color="#9A9AA0" strokeWidth={2.25} />
            <Text style={styles.rowLabel}>
              {t('pinned.title', { defaultValue: 'Pinned messages' })}
            </Text>
            <Text style={styles.rowValue}>{pinned.length}</Text>
            <ChevronRight size={16} color="#5C5C61" strokeWidth={2.25} />
          </Pressable>
          <View style={styles.hairline} />
          <View style={styles.row}>
            {muted ? (
              <BellOff size={18} color="#9A9AA0" strokeWidth={2.25} />
            ) : (
              <Bell size={18} color="#9A9AA0" strokeWidth={2.25} />
            )}
            <Text style={styles.rowLabel}>
              {t('details.notifications', { defaultValue: 'Notifications' })}
            </Text>
            <Switch
              value={!muted}
              onValueChange={() => {
                void haptic('selection');
                toggleMuted(conversationId);
              }}
              trackColor={{ false: '#333333', true: '#FFFFFF' }}
              thumbColor={muted ? '#FFFFFF' : '#000000'}
            />
          </View>
        </View>
      </ScrollView>

      <View style={[styles.backLayer, { top: insets.top + 6 }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={t('chatHeader.backAccessibilityLabel')}
        >
          <ChevronLeft size={26} color={COLORS.white} strokeWidth={2.25} />
        </Pressable>
      </View>

      <WallpaperPickerSheet
        visible={wallpaperVisible}
        onClose={() => setWallpaperVisible(false)}
        conversationId={conversationId}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0E0E10' },
  content: { paddingHorizontal: 16, gap: 18 },
  backLayer: { position: 'absolute', left: 10 },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  hero: { alignItems: 'center', gap: 8 },
  name: { color: COLORS.white, fontSize: 24, fontFamily: 'Archivo_700Bold' },
  role: { color: '#9A9AA0', fontSize: 14, fontFamily: 'Archivo_400Regular' },
  actions: { flexDirection: 'row', gap: 10 },
  actionChip: {
    flex: 1,
    height: 66,
    borderRadius: 16,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionText: { color: COLORS.white, fontSize: 12, fontFamily: 'Archivo_500Medium' },
  card: { backgroundColor: '#1C1C1E', borderRadius: 18, paddingVertical: 4 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  cardTitle: { color: COLORS.white, fontSize: 15, fontFamily: 'Archivo_600SemiBold' },
  cardCount: { color: '#9A9AA0', fontSize: 14, fontFamily: 'Archivo_400Regular' },
  mediaStrip: { gap: 6, paddingHorizontal: 12, paddingBottom: 14 },
  mediaThumb: { width: 78, height: 78, borderRadius: 10, backgroundColor: '#2A2A2E' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 16,
  },
  rowLabel: {
    color: COLORS.white,
    fontSize: 15,
    flex: 1,
    fontFamily: 'Archivo_400Regular',
  },
  rowValue: { color: '#9A9AA0', fontSize: 15, fontFamily: 'Archivo_400Regular' },
  hairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginLeft: 46,
  },
});
