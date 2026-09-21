import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { GlassSurface } from '@/components/navigation/GlassSurface';
import { COLORS } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { useThread } from '@/features/messages/hooks/useThread';
import { useParticipantProfile } from '@/features/messages/hooks/useParticipantAvatar';
import {
  toGiftedMessages,
  type AttoMessage,
} from '@/features/messages/utils/messageAdapter';
import { MessageRow } from '@/features/messages/thread/MessageRow';
import {
  ChatComposer,
  type ChatComposerHandle,
} from '@/features/messages/components/ChatComposer';
import { MediaMessage } from '@/features/messages/media/MediaMessage';
import { useSharedValue } from 'react-native-reanimated';

/**
 * Slack style thread: the root message pinned at the top, its replies below
 * in order, and a composer that only posts into this thread. Opened from a
 * bubble's context menu or its "N replies" footer.
 */
export default function ChatThreadScreen() {
  const { t } = useTranslation('messages');
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    conversationId: string;
    threadId: string;
    participantId?: string;
    participantName?: string;
  }>();
  const conversationId = String(params.conversationId ?? '');
  const threadId = String(params.threadId ?? '');
  const userId = String(useAuthStore((s) => s.user?.id) ?? '');
  const participant = useParticipantProfile(params.participantId ?? '');
  const participantName = participant.username || params.participantName || '';
  const { root, replies, isLoading, sendReply } = useThread(conversationId, threadId);

  const composerRef = useRef<ChatComposerHandle>(null);
  const draftRef = useRef('');
  const [justSentId, setJustSentId] = useState<string | null>(null);
  const timesReveal = useSharedValue(0);

  const rows = useMemo(
    () =>
      toGiftedMessages(
        [...(root ? [root] : []), ...replies],
        userId,
        participantName,
        participant.avatarUri ?? undefined
      ),
    [root, replies, userId, participantName, participant.avatarUri]
  );

  const renderMedia = useCallback(
    (msg: AttoMessage) =>
      msg.contentType && msg.contentType !== 'text' ? (
        <MediaMessage message={msg} isOwn={String(msg.user._id) === userId} />
      ) : null,
    [userId]
  );

  const labels = useMemo(
    () => ({
      you: t('chat.you', { defaultValue: 'You' }),
      deleted: t('actions.deleted', { defaultValue: 'Message deleted' }),
      edited: t('actions.edited', { defaultValue: 'edited' }),
    }),
    [t]
  );

  const handleSend = useCallback(
    async (text: string) => {
      const sent = await sendReply(text);
      setJustSentId(sent.messageId);
    },
    [sendReply]
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + 6 }]}>
      <View style={styles.header}>
        <GlassSurface radius={22} style={styles.glassButton}>
          <Pressable
            onPress={() => router.back()}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel={t('composer.collapse')}
          >
            <X size={22} color={COLORS.white} strokeWidth={2.25} />
          </Pressable>
        </GlassSurface>
        <GlassSurface radius={20} style={styles.titlePill}>
          <Text style={styles.title}>
            {t('thread.title')}
            {replies.length > 0
              ? `  ·  ${t('thread.replies', { count: replies.length })}`
              : ''}
          </Text>
        </GlassSurface>
        <View style={styles.glassButton} />
      </View>

      <KeyboardAvoidingView behavior="padding" style={styles.body}>
        <FlatList
          data={rows}
          keyExtractor={(m) => String(m._id)}
          contentContainerStyle={styles.list}
          keyboardDismissMode="interactive"
          renderItem={({ item, index }) => {
            const isOwn = String(item.user._id) === userId;
            const isRoot = index === 0 && !!root;
            return (
              <View style={isRoot ? styles.rootWrap : undefined}>
                <MessageRow
                  message={item}
                  isOwn={isOwn}
                  position={{ first: true, last: true }}
                  currentUserId={userId}
                  justSent={justSentId === String(item._id)}
                  senderIsCreator={false}
                  menuItems={[]}
                  labels={labels}
                  onMenuAction={() => {}}
                  onReply={() => {}}
                  onDoubleTap={() => {}}
                  onToggleReaction={() => {}}
                  renderMedia={renderMedia}
                  dimmed={false}
                  timesReveal={timesReveal}
                  onTimesRevealed={() => {}}
                  readLabel={null}
                />
                {isRoot ? <View style={styles.divider} /> : null}
              </View>
            );
          }}
          ListEmptyComponent={
            !isLoading ? (
              <Text style={styles.empty}>
                {root ? t('thread.empty') : t('thread.rootMissing')}
              </Text>
            ) : null
          }
        />
        <View style={[styles.toolbar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <ChatComposer
            ref={composerRef}
            conversationId={`${conversationId}:${threadId}`}
            draftRef={draftRef}
            generation={0}
            placeholder={t('thread.replyPlaceholder')}
            onSend={(text) => void handleSend(text)}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0E0E10' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  glassButton: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  titlePill: {
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  title: { color: COLORS.white, fontSize: 15, fontFamily: 'Archivo_600SemiBold' },
  body: { flex: 1 },
  list: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 12 },
  rootWrap: { paddingBottom: 4 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginVertical: 10,
    marginHorizontal: 8,
  },
  empty: {
    color: '#888',
    textAlign: 'center',
    marginTop: 24,
    fontFamily: 'Archivo_400Regular',
  },
  toolbar: { paddingHorizontal: 10, paddingTop: 6 },
});
