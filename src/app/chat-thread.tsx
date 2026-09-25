import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import * as Clipboard from 'expo-clipboard';
import { Check, ChevronLeft, MoreHorizontal } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { COLORS } from '@/constants/theme';
import { Text } from '@/components/ui/Text';
import { showToast } from '@/components/ui/Toast';
import { haptic } from '@/lib/haptics/hapticService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { useAuthStore } from '@/stores/authStore';
import { useThread } from '@/features/messages/hooks/useThread';
import { useReactions } from '@/features/messages/hooks/useReactions';
import { useMessageActions } from '@/features/messages/hooks/useMessageActions';
import { useParticipantProfile } from '@/features/messages/hooks/useParticipantAvatar';
import { useThreadFollowStore } from '@/features/messages/stores/threadFollowStore';
import { useThreadSeenStore } from '@/features/messages/stores/threadSeenStore';
import { useThreadsInbox } from '@/features/messages/hooks/useThreadsInbox';
import { typingKey } from '@/features/messages/hooks/useRealtimeChat';
import { useChatStore } from '@/features/messages/stores/chatStore';
import { phoenixSocket } from '@/lib/api/phoenixSocket';
import {
  toGiftedMessages,
  type AttoMessage,
} from '@/features/messages/utils/messageAdapter';
import { ChatThread, type ChatThreadHandle } from '@/features/messages/thread/ChatThread';
import type { MenuItem } from '@/features/messages/thread/MessageRow';
import { TapbackOverlay, type Anchor } from '@/features/messages/thread/TapbackOverlay';
import {
  ChatComposer,
  type ChatComposerHandle,
} from '@/features/messages/components/ChatComposer';
import { ReactionPicker } from '@/features/messages/components/ReactionPicker';
import { MediaMessage } from '@/features/messages/media/MediaMessage';

/**
 * Slack's thread, and Slack's shape for it: a screen of its own pushed from
 * the right, the message that started it at the top, a rule that counts the
 * replies, and every affordance the conversation has — reactions, the long
 * press menu, grouping, day separators — because in Slack a reply is a
 * message like any other (David, Sep 24 2026: the thread has to feel like
 * Slack's, not like a cut down list).
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
  const user = useAuthStore((s) => s.user);
  const userId = user ? String(user.id) : '';
  const participant = useParticipantProfile(params.participantId ?? '');
  const participantName = participant.username || params.participantName || '';
  const { root, replies, isLoading, sendReply } = useThread(conversationId, threadId);
  const { toggleReaction } = useReactions(conversationId);
  const { editMessage, deleteMessage, canEditOrDelete } =
    useMessageActions(conversationId);
  const markSeen = useThreadSeenStore((s) => s.markSeen);
  const following = useThreadFollowStore((s) => s.isFollowing(threadId));
  const setFollowing = useThreadFollowStore((s) => s.setFollowing);
  // The unread count and the follow flag also live on the server, so they
  // agree on the phone and the iPad and survive a reinstall.
  const inbox = useThreadsInbox();
  // Slack puts "typing" inside the thread, never in the channel, so the
  // indicator is kept under the thread's own key.
  const threadTypingKey = typingKey(conversationId, threadId);
  const typingUsers = useChatStore((s) => s.typingUsers[threadTypingKey]);
  const isParticipantTyping = (typingUsers?.size ?? 0) > 0;
  const isTypingRef = useRef(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const listRef = useRef<ChatThreadHandle>(null);
  const composerRef = useRef<ChatComposerHandle>(null);
  const draftRef = useRef('');
  const [composerGeneration, setComposerGeneration] = useState(0);
  const [editing, setEditing] = useState<AttoMessage | null>(null);
  const [justSentId, setJustSentId] = useState<string | null>(null);
  const [alsoSend, setAlsoSend] = useState(false);
  const [tapback, setTapback] = useState<{ message: AttoMessage; rect: Anchor } | null>(
    null
  );
  const [pickerFor, setPickerFor] = useState<AttoMessage | null>(null);

  // Opening a thread clears its unread mark in the conversation, as in Slack.
  useEffect(() => {
    const newest = replies.reduce(
      (max, r) => Math.max(max, Date.parse(r.createdAt ?? '') || 0),
      0
    );
    if (newest > 0) markSeen(threadId, newest);
  }, [replies, markSeen, threadId]);

  // The same thing on the server, once per open, so the threads inbox drops
  // the count on every device rather than only on this one.
  const markedReadRef = useRef(false);
  const markInboxRead = inbox.markRead;
  useEffect(() => {
    if (markedReadRef.current || !conversationId || !threadId) return;
    markedReadRef.current = true;
    markInboxRead(conversationId, threadId);
  }, [conversationId, threadId, markInboxRead]);

  // Stop the indicator when the thread closes, so the other side never sees
  // "typing" from a screen nobody is on.
  useEffect(
    () => () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (isTypingRef.current) phoenixSocket.sendTyping(conversationId, false, threadId);
    },
    [conversationId, threadId]
  );

  /** Every keystroke in the reply box, debounced the way the chat does it. */
  const handleTypingActivity = useCallback(
    (text: string) => {
      draftRef.current = text;
      if (text.length > 0 && !isTypingRef.current) {
        isTypingRef.current = true;
        phoenixSocket.sendTyping(conversationId, true, threadId);
      }
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        if (isTypingRef.current) {
          isTypingRef.current = false;
          phoenixSocket.sendTyping(conversationId, false, threadId);
        }
      }, 2000);
    },
    [conversationId, threadId]
  );

  /** Newest first for the inverted list, with the root last so it sits on top. */
  const items = useMemo(() => {
    const ordered = [...replies].reverse();
    const all = root ? [...ordered, root] : ordered;
    return toGiftedMessages(
      all,
      userId,
      participantName,
      participant.avatarUri ?? undefined
    );
  }, [replies, root, userId, participantName, participant.avatarUri]);

  const creatorIds = useMemo(() => {
    const ids = new Set<string>();
    if (user?.role === 'creator') ids.add(userId);
    if (participant.role === 'creator' && params.participantId)
      ids.add(String(params.participantId));
    return ids;
  }, [user?.role, userId, participant.role, params.participantId]);

  const avatarFor = useCallback(
    (id: string) =>
      id === userId ? (user?.avatar ?? null) : (participant.avatarUri ?? null),
    [userId, user?.avatar, participant.avatarUri]
  );

  const renderMedia = useCallback(
    (msg: AttoMessage, onLight: boolean) =>
      msg.contentType && msg.contentType !== 'text' ? (
        <MediaMessage message={msg} isOwn={onLight} />
      ) : null,
    []
  );

  const menuItemsFor = useCallback(
    (msg: AttoMessage, isOwn: boolean): MenuItem[] => {
      const items: MenuItem[] = [
        {
          actionKey: 'react',
          actionTitle: t('actions.react', { defaultValue: 'React' }),
          icon: { type: 'IMAGE_SYSTEM', imageValue: { systemName: 'face.smiling' } },
        },
        {
          actionKey: 'copy',
          actionTitle: t('actions.copy', { defaultValue: 'Copy' }),
          icon: { type: 'IMAGE_SYSTEM', imageValue: { systemName: 'doc.on.doc' } },
        },
        {
          actionKey: 'copyLink',
          actionTitle: t('actions.copyLink'),
          icon: { type: 'IMAGE_SYSTEM', imageValue: { systemName: 'link' } },
        },
      ];
      if (isOwn && canEditOrDelete(String(msg._id))) {
        items.push(
          {
            actionKey: 'edit',
            actionTitle: t('actions.edit', { defaultValue: 'Edit' }),
            icon: { type: 'IMAGE_SYSTEM', imageValue: { systemName: 'pencil' } },
          },
          {
            actionKey: 'delete',
            actionTitle: t('actions.delete', { defaultValue: 'Delete' }),
            icon: { type: 'IMAGE_SYSTEM', imageValue: { systemName: 'trash' } },
            menuAttributes: ['destructive'],
          }
        );
      }
      return items;
    },
    [canEditOrDelete, t]
  );

  const handleMenuAction = useCallback(
    (actionKey: string, msg: AttoMessage) => {
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.CONTEXT_MENU_ACTION, {
        conversation_id: conversationId,
        thread_id: threadId,
        message_id: msg._id,
        action: actionKey,
        surface: 'thread',
      });
      switch (actionKey) {
        case 'react':
          setPickerFor(msg);
          break;
        case 'copy':
          void Clipboard.setStringAsync(msg.text);
          showToast(t('actions.copied', { defaultValue: 'Copied' }));
          break;
        case 'copyLink':
          void Clipboard.setStringAsync(
            `https://atto.sound/m/${conversationId}/${String(msg._id)}`
          );
          showToast(t('actions.linkCopied'));
          break;
        case 'edit':
          draftRef.current = msg.text;
          setComposerGeneration((g) => g + 1);
          setEditing(msg);
          break;
        case 'delete':
          Alert.alert(
            t('actions.deleteConfirmTitle', { defaultValue: 'Delete Message' }),
            t('actions.deleteConfirmBody', { defaultValue: 'This cannot be undone.' }),
            [
              { text: t('actions.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
              {
                text: t('actions.delete', { defaultValue: 'Delete' }),
                style: 'destructive',
                onPress: () => void deleteMessage(String(msg._id)),
              },
            ]
          );
          break;
        default:
          break;
      }
    },
    [conversationId, threadId, deleteMessage, t]
  );

  const handleSend = useCallback(
    async (text: string) => {
      if (editing) {
        await editMessage(String(editing._id), text);
        setEditing(null);
        return;
      }
      // Slack's "also send to the channel": the reply stays in the thread and
      // is shown in the conversation as well.
      const sent = await sendReply(text, alsoSend ? { alsoSendToChat: true } : undefined);
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.THREAD_REPLY_SENT, {
        conversation_id: conversationId,
        thread_id: threadId,
        also_sent_to_chat: alsoSend,
      });
      if (isTypingRef.current) {
        isTypingRef.current = false;
        phoenixSocket.sendTyping(conversationId, false, threadId);
      }
      setJustSentId(sent.messageId);
      listRef.current?.scrollToBottom(true);
    },
    [alsoSend, conversationId, editing, editMessage, sendReply, threadId]
  );

  const openOverflow = useCallback(() => {
    void haptic('selection');
    const follow = following ? t('thread.unfollowThread') : t('thread.followThread');
    const copy = t('actions.copyLink');
    const cancel = t('actions.cancel', { defaultValue: 'Cancel' });
    const act = (index: number) => {
      if (index === 0) {
        setFollowing(threadId, !following);
        inbox.setFollowing(conversationId, threadId, !following);
        showToast(following ? t('thread.unfollowed') : t('thread.following'));
      } else if (index === 1) {
        void Clipboard.setStringAsync(
          `https://atto.sound/m/${conversationId}/${threadId}`
        );
        showToast(t('actions.linkCopied'));
      }
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [follow, copy, cancel],
          cancelButtonIndex: 2,
          userInterfaceStyle: 'dark',
        },
        act
      );
    } else {
      Alert.alert(t('thread.title'), undefined, [
        { text: follow, onPress: () => act(0) },
        { text: copy, onPress: () => act(1) },
        { text: cancel, style: 'cancel' },
      ]);
    }
  }, [conversationId, following, inbox, setFollowing, t, threadId]);

  const tapbackMine = useMemo(() => {
    const set = new Set<string>();
    for (const r of tapback?.message.reactions ?? [])
      if (String(r.userId) === userId) set.add(r.emoji);
    return set;
  }, [tapback, userId]);

  return (
    <View style={styles.container}>
      {/* Slack's header: back, the word Thread, whose conversation it belongs
          to underneath, and the overflow that follows or unfollows it. */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.iconButton}
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
        <Pressable
          onPress={openOverflow}
          hitSlop={10}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel={t('thread.title')}
        >
          <MoreHorizontal size={22} color={COLORS.white} strokeWidth={2.25} />
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior="padding" style={styles.body}>
        <ChatThread
          ref={listRef}
          messages={items}
          currentUserId={userId}
          threadRootId={root ? String(root.messageId) : null}
          anchorTop
          showFloatingDay={false}
          avatarFor={avatarFor}
          justSentId={justSentId}
          creatorIds={creatorIds}
          isParticipantTyping={isParticipantTyping}
          participantName={participantName}
          hasMore={false}
          isFetchingMore={false}
          onLoadMore={() => {}}
          menuItemsFor={menuItemsFor}
          onMenuAction={handleMenuAction}
          onReply={() => {}}
          onDoubleTap={(msg, rect) => setTapback({ message: msg, rect })}
          onToggleReaction={(msg, emoji) =>
            toggleReaction(String(msg._id), emoji, msg.reactions)
          }
          renderMedia={renderMedia}
          focusedId={null}
          readAt={null}
          bottomInset={0}
          topInset={0}
        />
        {!isLoading && items.length === 0 ? (
          <Text style={styles.empty}>{t('thread.rootMissing')}</Text>
        ) : null}

        <View style={[styles.toolbar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <ChatComposer
            ref={composerRef}
            conversationId={`${conversationId}:${threadId}`}
            draftRef={draftRef}
            generation={composerGeneration}
            placeholder={
              editing
                ? t('actions.edit', { defaultValue: 'Edit' })
                : t('thread.replyPlaceholder')
            }
            onSend={(text) => void handleSend(text)}
            onTextActivity={handleTypingActivity}
            // Slack keeps the broadcast checkbox with the reply box, naming
            // where the copy would land.
            preview={
              <Pressable
                onPress={() => {
                  void haptic('selection');
                  setAlsoSend((v) => !v);
                }}
                style={styles.alsoRow}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: alsoSend }}
                accessibilityLabel={t('thread.alsoSendNamed', {
                  name: participantName || t('thread.title'),
                })}
              >
                <View style={[styles.checkbox, alsoSend && styles.checkboxOn]}>
                  {alsoSend ? (
                    <Check size={13} color={COLORS.black} strokeWidth={3} />
                  ) : null}
                </View>
                <Text style={styles.alsoText}>
                  {t('thread.alsoSendNamed', {
                    name: participantName || t('thread.title'),
                  })}
                </Text>
              </Pressable>
            }
          />
        </View>
      </KeyboardAvoidingView>

      <TapbackOverlay
        anchor={tapback?.rect ?? null}
        mine={tapbackMine}
        onPick={(emoji) => {
          if (tapback)
            toggleReaction(String(tapback.message._id), emoji, tapback.message.reactions);
          setTapback(null);
        }}
        onMore={() => {
          setPickerFor(tapback?.message ?? null);
          setTapback(null);
        }}
        onClose={() => setTapback(null)}
      />

      <ReactionPicker
        visible={pickerFor !== null}
        onSelect={(emoji) => {
          if (pickerFor)
            toggleReaction(String(pickerFor._id), emoji, pickerFor.reactions ?? []);
          setPickerFor(null);
        }}
        onClose={() => setPickerFor(null)}
      />
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
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, alignItems: 'center' },
  title: { color: COLORS.white, fontSize: 17, fontFamily: 'Archivo_600SemiBold' },
  subtitle: { color: '#9A9AA0', fontSize: 12, fontFamily: 'Archivo_400Regular' },
  body: { flex: 1 },
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
