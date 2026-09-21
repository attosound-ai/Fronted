import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Check, ChevronLeft } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useSharedValue } from 'react-native-reanimated';

import { COLORS } from '@/constants/theme';
import { haptic } from '@/lib/haptics/hapticService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
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

/**
 * Slack's thread, and Slack's shape for it: not a card floating over the
 * conversation but a screen of its own, pushed from the right, with the
 * message that started it at the top, a rule that counts the replies, and a
 * composer that can also drop the reply back into the chat.
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
  const [alsoSend, setAlsoSend] = useState(false);
  const timesReveal = useSharedValue(0);

  const rootRows = useMemo(
    () =>
      toGiftedMessages(
        root ? [root] : [],
        userId,
        participantName,
        participant.avatarUri ?? undefined
      ),
    [root, userId, participantName, participant.avatarUri]
  );
  const replyRows = useMemo(
    () =>
      toGiftedMessages(
        replies,
        userId,
        participantName,
        participant.avatarUri ?? undefined
      ),
    [replies, userId, participantName, participant.avatarUri]
  );

  const renderMedia = useCallback(
    (msg: AttoMessage, onLight: boolean) =>
      msg.contentType && msg.contentType !== 'text' ? (
        <MediaMessage message={msg} isOwn={onLight} />
      ) : null,
    []
  );

  const labels = useMemo(
    () => ({
      you: t('chat.you', { defaultValue: 'You' }),
      deleted: t('actions.deleted', { defaultValue: 'Message deleted' }),
      edited: t('actions.edited', { defaultValue: 'edited' }),
      replies: (count: number) => t('thread.replies', { count }),
      replay: t('effects.replay'),
      forwarded: t('actions.forwarded'),
    }),
    [t]
  );

  const handleSend = useCallback(
    async (text: string) => {
      // Slack's "also send to the channel": the reply stays in the thread
      // and is shown in the conversation as well.
      const sent = await sendReply(text, alsoSend ? { alsoSendToChat: true } : undefined);
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.THREAD_REPLY_SENT, {
        conversation_id: conversationId,
        thread_id: threadId,
        also_sent_to_chat: alsoSend,
      });
      setJustSentId(sent.messageId);
    },
    [alsoSend, conversationId, sendReply, threadId]
  );

  const row = useCallback(
    (item: AttoMessage, isRoot: boolean) => (
      <MessageRow
        message={item}
        isOwn={String(item.user._id) === userId}
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
        readLabel={isRoot ? null : null}
      />
    ),
    [justSentId, labels, renderMedia, timesReveal, userId]
  );

  return (
    <View style={styles.container}>
      {/* Slack's header: back, the word Thread, and whose conversation it
          belongs to underneath. */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel={t('chatHeader.backAccessibilityLabel')}
        >
          <ChevronLeft size={26} color={COLORS.white} strokeWidth={2.25} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>{t('thread.title')}</Text>
          {participantName ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {participantName}
            </Text>
          ) : null}
        </View>
        <View style={styles.back} />
      </View>

      <KeyboardAvoidingView behavior="padding" style={styles.body}>
        <FlatList
          data={replyRows}
          keyExtractor={(m) => String(m._id)}
          contentContainerStyle={styles.list}
          keyboardDismissMode="interactive"
          ListHeaderComponent={
            <View>
              {rootRows.map((item) => (
                <View key={String(item._id)}>{row(item, true)}</View>
              ))}
              {/* The rule that counts what came after, exactly where Slack
                  puts it. */}
              <View style={styles.countRow}>
                <Text style={styles.countText}>
                  {replies.length > 0
                    ? t('thread.replies', { count: replies.length })
                    : t('thread.noReplies')}
                </Text>
                <View style={styles.countRule} />
              </View>
            </View>
          }
          renderItem={({ item }) => row(item, false)}
          ListEmptyComponent={
            !isLoading && !root ? (
              <Text style={styles.empty}>{t('thread.rootMissing')}</Text>
            ) : null
          }
        />

        <View style={[styles.toolbar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <ChatComposer
            ref={composerRef}
            conversationId={`${conversationId}:${threadId}`}
            draftRef={draftRef}
            generation={0}
            placeholder={t('thread.replyPlaceholder')}
            onSend={(text) => void handleSend(text)}
            // Slack keeps the broadcast checkbox inside the reply box,
            // above what you are writing.
            preview={
              <Pressable
                onPress={() => {
                  haptic('selection');
                  setAlsoSend((v) => !v);
                }}
                style={styles.alsoRow}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: alsoSend }}
                accessibilityLabel={t('thread.alsoSend')}
              >
                <View style={[styles.checkbox, alsoSend && styles.checkboxOn]}>
                  {alsoSend ? (
                    <Check size={13} color={COLORS.black} strokeWidth={3} />
                  ) : null}
                </View>
                <Text style={styles.alsoText}>{t('thread.alsoSend')}</Text>
              </Pressable>
            }
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
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, alignItems: 'center' },
  title: { color: COLORS.white, fontSize: 17, fontFamily: 'Archivo_600SemiBold' },
  subtitle: { color: '#9A9AA0', fontSize: 12, fontFamily: 'Archivo_400Regular' },
  body: { flex: 1 },
  list: { paddingHorizontal: 10, paddingTop: 4, paddingBottom: 12 },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 12 },
  countText: { color: '#9A9AA0', fontSize: 13, fontFamily: 'Archivo_500Medium' },
  countRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  empty: {
    color: '#888',
    textAlign: 'center',
    marginTop: 24,
    fontFamily: 'Archivo_400Regular',
  },
  toolbar: { paddingHorizontal: 10, paddingTop: 6, gap: 8 },
  alsoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 2,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: COLORS.white, borderColor: COLORS.white },
  alsoText: { color: '#C9C9CE', fontSize: 13, fontFamily: 'Archivo_400Regular' },
});
