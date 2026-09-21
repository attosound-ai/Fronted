import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Check, Search, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/ui/Avatar';
import { COLORS } from '@/constants/theme';
import { haptic } from '@/lib/haptics/hapticService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { useConversations } from '../hooks/useConversations';
import { useUserSearch } from '../hooks/useUserSearch';
import { useParticipantProfile } from '../hooks/useParticipantAvatar';
import { messageService } from '../services/messageService';
import type { MessageMetadata, SharedPost } from '../types';

/** What the row sends: a post card, or a message being forwarded. */
export type SendPayload =
  | { kind: 'post'; post: SharedPost }
  | {
      kind: 'forward';
      content: string;
      contentType: string;
      metadata?: MessageMetadata | null;
      /** Shown in the row's title, so people know what is being sent. */
      label?: string;
    };

interface SendToChatRowProps {
  payload: SendPayload;
  /** Hidden when the sheet already has its own note field. */
  withNote?: boolean;
  onSent?: (conversationId: string) => void;
}

/**
 * The row of chats at the top of the share sheet, the way WhatsApp,
 * Instagram and Telegram offer the conversation before anything else. One
 * tap sends the post as a card into that chat.
 */
export function SendToChatRow({ payload, withNote = true, onSent }: SendToChatRowProps) {
  const { t } = useTranslation('messages');
  const { conversations, isLoading } = useConversations();
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { results, isLoading: searching } = useUserSearch(query);
  const knownIds = useMemo(
    () => new Set(conversations.map((c) => String(c.participantId))),
    [conversations]
  );

  const send = useCallback(
    async (conversationId: string) => {
      if (sent[conversationId] || sending) return;
      setSending(conversationId);
      haptic('light');
      try {
        const caption = note.trim();
        if (payload.kind === 'post') {
          const { post } = payload;
          await messageService.sendMessage({
            conversationId,
            content: `https://atto.sound/post/${post.id}`,
            contentType: 'post',
            metadata: caption ? { post, caption } : { post },
          });
          analytics.capture(ANALYTICS_EVENTS.MESSAGES.SHARED_POST_SENT, {
            conversation_id: conversationId,
            post_id: post.id,
            post_type: post.type,
          });
        } else {
          // Forwarded, the way WhatsApp and Telegram mark it: the same
          // content, with a note that it comes from somewhere else.
          await messageService.sendMessage({
            conversationId,
            content: payload.content,
            contentType: payload.contentType,
            metadata: { ...(payload.metadata ?? {}), forwarded: true },
          });
          analytics.capture(ANALYTICS_EVENTS.MESSAGES.MESSAGE_FORWARDED, {
            conversation_id: conversationId,
            content_type: payload.contentType,
          });
        }
        setSent((s) => ({ ...s, [conversationId]: true }));
        onSent?.(conversationId);
      } catch (error) {
        analytics.capture(ANALYTICS_EVENTS.MESSAGES.MEDIA_MESSAGE_FAILED, {
          conversation_id: conversationId,
          kind: 'post',
          stage: 'send',
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setSending(null);
      }
    },
    [note, onSent, payload, sending, sent]
  );

  // Someone you have not written to yet: resolve (or create) the chat and
  // send there, so the post never has to wait for a first message.
  const sendToUser = useCallback(
    async (userId: string, username: string) => {
      setSending(userId);
      try {
        const conversationId = await messageService.createConversation({
          participantId: userId,
          participantName: username,
        });
        setSearchOpen(false);
        setQuery('');
        await send(conversationId);
      } catch (error) {
        analytics.capture(ANALYTICS_EVENTS.MESSAGES.MEDIA_MESSAGE_FAILED, {
          kind: 'post',
          stage: 'conversation',
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setSending(null);
      }
    },
    [send]
  );

  if (isLoading && !conversations.length) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={COLORS.white} />
      </View>
    );
  }
  if (!conversations.length) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{t('sharedPost.shareTitle')}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        <Pressable
          onPress={() => setSearchOpen(true)}
          style={styles.chip}
          accessibilityRole="button"
          accessibilityLabel={t('sharedPost.searchPeople')}
        >
          <View style={styles.searchCircle}>
            <Search size={22} color={COLORS.white} strokeWidth={2.25} />
          </View>
          <Text style={styles.name} numberOfLines={1}>
            {t('sharedPost.search')}
          </Text>
        </Pressable>
        {conversations.map((conv) => (
          <ChatChip
            key={conv.conversationId}
            participantId={conv.participantId}
            fallbackName={conv.participantName}
            busy={sending === conv.conversationId}
            done={!!sent[conv.conversationId]}
            onPress={() => void send(conv.conversationId)}
          />
        ))}
      </ScrollView>

      {/* Instagram and WhatsApp let a note ride along with what is shared. */}
      {withNote ? (
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={t('sharedPost.notePlaceholder')}
          placeholderTextColor="#7A7A80"
          style={styles.noteField}
          keyboardAppearance="dark"
          maxLength={300}
          accessibilityLabel={t('sharedPost.notePlaceholder')}
        />
      ) : null}

      <Modal
        visible={searchOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSearchOpen(false)}
      >
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{t('sharedPost.searchPeople')}</Text>
            <Pressable
              onPress={() => setSearchOpen(false)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('sharedPost.close')}
            >
              <X size={22} color={COLORS.white} strokeWidth={2.25} />
            </Pressable>
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('sharedPost.searchPlaceholder')}
            placeholderTextColor="#7A7A80"
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.searchField}
            keyboardAppearance="dark"
          />
          <ScrollView keyboardShouldPersistTaps="handled">
            {searching ? (
              <ActivityIndicator color={COLORS.white} style={styles.loading} />
            ) : null}
            {results.map((user) => (
              <Pressable
                key={String(user.id)}
                onPress={() => void sendToUser(String(user.id), user.username ?? '')}
                style={styles.resultRow}
                accessibilityRole="button"
                accessibilityLabel={user.username ?? String(user.id)}
              >
                <Avatar
                  uri={user.avatar ?? undefined}
                  size="md"
                  fallbackText={user.username ?? ''}
                />
                <View style={styles.resultBody}>
                  <Text style={styles.resultName} numberOfLines={1}>
                    {user.username}
                  </Text>
                  {knownIds.has(String(user.id)) ? (
                    <Text style={styles.resultHint}>{t('sharedPost.existingChat')}</Text>
                  ) : null}
                </View>
                {sending === String(user.id) ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function ChatChip({
  participantId,
  fallbackName,
  busy,
  done,
  onPress,
}: {
  participantId: string;
  fallbackName: string;
  busy: boolean;
  done: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation('messages');
  const { avatarUri, username } = useParticipantProfile(participantId);
  const name = username || fallbackName;
  return (
    <Pressable
      onPress={onPress}
      style={styles.chip}
      accessibilityRole="button"
      accessibilityLabel={name}
    >
      <View>
        <Avatar uri={avatarUri} size="md" fallbackText={name} />
        {done ? (
          <View style={styles.doneBadge}>
            <Check size={14} color={COLORS.black} strokeWidth={3} />
          </View>
        ) : null}
        {busy ? (
          <View style={styles.doneBadge}>
            <ActivityIndicator size="small" color={COLORS.black} />
          </View>
        ) : null}
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {done ? t('sharedPost.sent') : name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingBottom: 10, gap: 10 },
  title: { color: '#8E8E93', fontSize: 12, fontFamily: 'Archivo_600SemiBold' },
  row: { gap: 14, paddingRight: 8, paddingVertical: 2 },
  // Wide enough for a whole username: "david_espejo" never gets clipped.
  chip: { width: 86, alignItems: 'center', gap: 6 },
  name: {
    color: COLORS.white,
    fontSize: 12,
    fontFamily: 'Archivo_400Regular',
    textAlign: 'center',
  },
  searchCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: { flex: 1, backgroundColor: '#0E0E10', padding: 16, gap: 12 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: { color: COLORS.white, fontSize: 18, fontFamily: 'Archivo_600SemiBold' },
  searchField: {
    height: 44,
    borderRadius: 14,
    backgroundColor: '#1A1A1D',
    paddingHorizontal: 14,
    color: COLORS.white,
    fontSize: 16,
    fontFamily: 'Archivo_400Regular',
  },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  resultBody: { flex: 1, gap: 2 },
  resultName: { color: COLORS.white, fontSize: 15, fontFamily: 'Archivo_500Medium' },
  resultHint: { color: '#7A7A80', fontSize: 12, fontFamily: 'Archivo_400Regular' },
  loading: { paddingVertical: 18, alignItems: 'center' },
  noteField: {
    height: 42,
    borderRadius: 14,
    backgroundColor: '#1A1A1D',
    paddingHorizontal: 14,
    color: COLORS.white,
    fontSize: 15,
    fontFamily: 'Archivo_400Regular',
  },
  doneBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
