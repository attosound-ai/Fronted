import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  Archive,
  Bell,
  BellOff,
  ChevronLeft,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  Link2,
  Phone,
  Pin,
  Trash2,
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
import { messageService } from '@/features/messages/services/messageService';
import { FullscreenImageViewer } from '@/components/ui/FullscreenImageViewer';
import { showToast } from '@/components/ui/Toast';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { useQueryClient } from '@tanstack/react-query';
import type { ChatConversation } from '@/features/messages/types';

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
  const { avatarUri, username, role, displayName, bio } =
    useParticipantProfile(participantId);
  const name = username || params.participantName || t('conversation.fallbackUserName');
  const { messages } = useChat(conversationId);
  const { pinned } = usePinnedMessages(conversationId);
  const muted = useConversationPrefsStore((s) => s.muted[conversationId] === true);
  const toggleMuted = useConversationPrefsStore((s) => s.toggleMuted);
  // Pinned carries the moment it was pinned, not a flag, so read it as truthy.
  const isPinned = useConversationPrefsStore((s) => !!s.pinned[conversationId]);
  const togglePinned = useConversationPrefsStore((s) => s.togglePinned);
  const archive = useConversationPrefsStore((s) => s.archive);
  const queryClient = useQueryClient();
  const [wallpaperVisible, setWallpaperVisible] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  /**
   * Every picture this conversation has loaded, newest first. A media message
   * carries its url as the content (MediaMessage reads message.text); a video
   * only shows here when it came with a thumbnail, so no tile is ever blank.
   */
  const media = useMemo(
    () =>
      messages
        .filter((m) => isVisualContentType(m.contentType))
        .map((m) => ({
          id: m.messageId,
          uri: m.contentType === 'image' ? m.content : (m.metadata?.thumbnailUrl ?? ''),
        }))
        .filter((m) => !!m.uri)
        .slice(0, 12),
    [messages]
  );

  /** Every link anyone sent in this conversation, newest first. */
  const links = useMemo(() => {
    const found: { id: string; url: string }[] = [];
    for (const m of messages) {
      if (m.contentType && m.contentType !== 'text') continue;
      const url = m.content?.match(/https?:\/\/[^\s]+/)?.[0];
      if (url) found.push({ id: m.messageId, url });
    }
    return found;
  }, [messages]);

  /** Documents and audio: what WhatsApp counts as files. */
  const files = useMemo(
    () =>
      messages.filter(
        (m) =>
          m.contentType && m.contentType !== 'text' && !isVisualContentType(m.contentType)
      ),
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

  const copyUsername = useCallback(() => {
    void haptic('selection');
    void Clipboard.setStringAsync(`@${name}`);
    showToast(t('details.usernameCopied'));
  }, [name, t]);

  const archiveChat = useCallback(() => {
    void haptic('light');
    archive(conversationId, null);
    showToast(t('details.archived'));
    router.dismissAll();
  }, [archive, conversationId, t]);

  /**
   * The same delete the list offers on a left swipe: for this user only, and
   * only what is already there. Both apps keep it at the bottom, in red.
   */
  const deleteChat = useCallback(() => {
    void haptic('warning');
    Alert.alert(
      t('listActions.deleteConfirmTitle'),
      t('listActions.deleteConfirmBody', { name }),
      [
        { text: t('actions.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        {
          text: t('listActions.delete'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await messageService.deleteConversation(conversationId);
                queryClient.setQueryData<ChatConversation[]>(
                  QUERY_KEYS.MESSAGES.CONVERSATIONS(),
                  (old) => (old ?? []).filter((c) => c.conversationId !== conversationId)
                );
                queryClient.removeQueries({
                  queryKey: QUERY_KEYS.MESSAGES.CHAT(conversationId),
                });
                showToast(t('listActions.deleted'));
                router.dismissAll();
              } catch {
                showToast(t('listActions.deleteFailed'));
              }
            })();
          },
        },
      ]
    );
  }, [conversationId, name, queryClient, t]);

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
          {displayName && displayName !== name ? (
            <Text style={styles.name} numberOfLines={1}>
              {displayName}
            </Text>
          ) : null}
          {/* Telegram copies the handle when you tap it. */}
          <Pressable onPress={copyUsername} hitSlop={8} accessibilityRole="button">
            <Text
              style={displayName && displayName !== name ? styles.handle : styles.name}
              numberOfLines={1}
            >
              @{name}
            </Text>
          </Pressable>
          <Text style={styles.role}>{roleLabel}</Text>
          {bio ? (
            <Text style={styles.bio} numberOfLines={4}>
              {bio}
            </Text>
          ) : null}
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

        {/* WhatsApp's "media, links and docs", with each part counted. */}
        {media.length > 0 || links.length > 0 || files.length > 0 ? (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>
                {t('details.media', { defaultValue: 'Media' })}
              </Text>
              <Text style={styles.cardCount}>{media.length}</Text>
            </View>
            {media.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.mediaStrip}
              >
                {media.map((m) => (
                  <Pressable
                    key={m.id}
                    onPress={action('media_open', () => setViewerUri(m.uri))}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={t('details.media', { defaultValue: 'Media' })}
                  >
                    <Image
                      source={{ uri: cloudinaryUrl(m.uri, 'post_thumb') ?? m.uri }}
                      style={styles.mediaThumb}
                    />
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            {links.length > 0 ? (
              <>
                <View style={styles.hairline} />
                <Pressable
                  style={styles.row}
                  onPress={action('links', () => {
                    void Linking.openURL(links[0].url);
                  })}
                  accessibilityRole="button"
                  accessibilityLabel={t('details.links')}
                >
                  <Link2 size={18} color="#9A9AA0" strokeWidth={2.25} />
                  <Text style={styles.rowLabel}>{t('details.links')}</Text>
                  <Text style={styles.rowValue}>{links.length}</Text>
                  <ChevronRight size={16} color="#5C5C61" strokeWidth={2.25} />
                </Pressable>
              </>
            ) : null}
            {files.length > 0 ? (
              <>
                <View style={styles.hairline} />
                <View style={styles.row}>
                  <FileText size={18} color="#9A9AA0" strokeWidth={2.25} />
                  <Text style={styles.rowLabel}>{t('details.files')}</Text>
                  <Text style={styles.rowValue}>{files.length}</Text>
                </View>
              </>
            ) : null}
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
              {t('details.pinned', { defaultValue: 'Pinned messages' })}
            </Text>
            <Text style={styles.rowValue}>{pinned.length}</Text>
            <ChevronRight size={16} color="#5C5C61" strokeWidth={2.25} />
          </Pressable>
          <View style={styles.hairline} />
          {/* Both apps let the whole row toggle, and the switch sits in a box
              of its own size so nothing in the row can push it off centre. */}
          <Pressable
            style={styles.row}
            onPress={() => {
              void haptic('selection');
              toggleMuted(conversationId);
            }}
            accessibilityRole="switch"
            accessibilityState={{ checked: !muted }}
            accessibilityLabel={t('details.notifications', {
              defaultValue: 'Notifications',
            })}
          >
            {muted ? (
              <BellOff size={18} color="#9A9AA0" strokeWidth={2.25} />
            ) : (
              <Bell size={18} color="#9A9AA0" strokeWidth={2.25} />
            )}
            <Text style={styles.rowLabel}>
              {t('details.notifications', { defaultValue: 'Notifications' })}
            </Text>
            <View style={styles.switchBox} pointerEvents="none">
              <Switch
                value={!muted}
                onValueChange={() => {
                  toggleMuted(conversationId);
                }}
                trackColor={{ false: '#333333', true: '#FFFFFF' }}
                thumbColor={muted ? '#FFFFFF' : '#000000'}
                ios_backgroundColor="#333333"
              />
            </View>
          </Pressable>
          <View style={styles.hairline} />
          <Pressable
            style={styles.row}
            onPress={() => {
              void haptic('selection');
              togglePinned(conversationId);
            }}
            accessibilityRole="switch"
            accessibilityState={{ checked: isPinned }}
            accessibilityLabel={t('details.pinConversation')}
          >
            <Pin size={18} color="#9A9AA0" strokeWidth={2.25} />
            <Text style={styles.rowLabel}>{t('details.pinConversation')}</Text>
            <View style={styles.switchBox} pointerEvents="none">
              <Switch
                value={isPinned}
                onValueChange={() => {
                  togglePinned(conversationId);
                }}
                trackColor={{ false: '#333333', true: '#FFFFFF' }}
                thumbColor={isPinned ? '#000000' : '#FFFFFF'}
                ios_backgroundColor="#333333"
              />
            </View>
          </Pressable>
          <View style={styles.hairline} />
          <Pressable
            style={styles.row}
            onPress={action('archive', archiveChat)}
            accessibilityRole="button"
            accessibilityLabel={t('details.archive')}
          >
            <Archive size={18} color="#9A9AA0" strokeWidth={2.25} />
            <Text style={styles.rowLabel}>{t('details.archive')}</Text>
            <ChevronRight size={16} color="#5C5C61" strokeWidth={2.25} />
          </Pressable>
        </View>

        {/* Both apps keep the one destructive action alone at the bottom. */}
        <View style={styles.card}>
          <Pressable
            style={styles.row}
            onPress={deleteChat}
            accessibilityRole="button"
            accessibilityLabel={t('details.deleteChat')}
          >
            <Trash2 size={18} color={DESTRUCTIVE} strokeWidth={2.25} />
            <Text style={[styles.rowLabel, styles.destructiveLabel]}>
              {t('details.deleteChat')}
            </Text>
          </Pressable>
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

      <FullscreenImageViewer
        uri={viewerUri ?? ''}
        visible={viewerUri !== null}
        onClose={() => setViewerUri(null)}
      />

      <WallpaperPickerSheet
        visible={wallpaperVisible}
        onClose={() => setWallpaperVisible(false)}
        conversationId={conversationId}
      />
    </View>
  );
}

// The one colour on this screen, the same red the swipe delete uses.
const DESTRUCTIVE = '#EF4444';

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
  hero: { alignItems: 'center' },
  name: {
    color: COLORS.white,
    fontSize: 24,
    // The shared Text sets a 20 pt line box for its body variant, which clips
    // the top of 24 pt glyphs; the name carries its own.
    lineHeight: 30,
    fontFamily: 'Archivo_700Bold',
    marginTop: 14,
  },
  handle: {
    color: '#9A9AA0',
    fontSize: 15,
    fontFamily: 'Archivo_500Medium',
    marginTop: 4,
  },
  role: {
    color: '#9A9AA0',
    fontSize: 14,
    fontFamily: 'Archivo_400Regular',
    marginTop: 4,
  },
  bio: {
    color: '#C9C9CE',
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Archivo_400Regular',
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 12,
  },
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
    height: 52,
    paddingHorizontal: 16,
  },
  // An iOS switch is 51 by 31. Giving it a box of exactly that size keeps it
  // off the row's flex maths, which is what pushed it off centre.
  switchBox: {
    width: 51,
    height: 31,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    color: COLORS.white,
    fontSize: 15,
    flex: 1,
    fontFamily: 'Archivo_400Regular',
  },
  rowValue: { color: '#9A9AA0', fontSize: 15, fontFamily: 'Archivo_400Regular' },
  destructiveLabel: { color: DESTRUCTIVE, fontFamily: 'Archivo_500Medium' },
  hairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginLeft: 46,
  },
});
