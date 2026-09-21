/**
 * ChatScreen — main chat view powered by react-native-gifted-chat.
 *
 * Integrates: Phoenix WebSocket real-time, reactions, edit/delete,
 * audio/video players, optimistic sends, dark theme.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Alert, Keyboard, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import type { IMessage } from 'react-native-gifted-chat';
import {
  KeyboardAvoidingView,
  useReanimatedKeyboardAnimation,
} from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { hasEffectPlayed, markEffectPlayed } from '../effects/effectMemory';
import { ChatThread, type ChatThreadHandle } from '../thread/ChatThread';
import type { MenuItem } from '../thread/MessageRow';
import { TapbackOverlay, type Anchor } from '../thread/TapbackOverlay';
import { X, Pencil } from 'lucide-react-native';

import { QUERY_KEYS } from '@/constants/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { COLORS, SPACING } from '@/constants/theme';
import { Text } from '@/components/ui/Text';
import { showToast } from '@/components/ui/Toast';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { haptic } from '@/lib/haptics/hapticService';

import { useChat } from '../hooks/useChat';
import { useParticipantProfile } from '../hooks/useParticipantAvatar';
import { useRealtimeChat } from '../hooks/useRealtimeChat';
import { useReactions } from '../hooks/useReactions';
import { useMessageActions } from '../hooks/useMessageActions';
import { useChatStore } from '../stores/chatStore';
import { messageService } from '../services/messageService';
import { notificationService } from '@/features/notifications/services/notificationService';
import { useNotificationStore } from '@/stores/notificationStore';
import { toGiftedMessages, type AttoMessage } from '../utils/messageAdapter';

import { ChatHeader } from './ChatHeader';
import { ChatComposer, type ChatComposerHandle } from './ChatComposer';
import { ReactionPicker } from './ReactionPicker';
import { useChatWallpapers } from '../hooks/useChatWallpapers';
import {
  CHAT_WALLPAPER_NONE_ID,
  resolveWallpaperChoice,
  useChatWallpaperStore,
} from '@/stores/chatWallpaperStore';
import { ChatWallpaperLayer } from './ChatWallpaperLayer';
import { useConversationPrefsStore } from '../stores/conversationPrefsStore';
import { WallpaperPickerSheet } from './WallpaperPickerSheet';
import { type AttachAction } from './AttachMenu';
import { TopFadeBlur } from './TopFadeBlur';
import { PinnedBar } from './PinnedBar';
import { ReplyFocus } from './ReplyFocus';
import { usePinnedMessages } from '../hooks/usePinnedMessages';
import { useCameraStore, type CameraMode } from '../stores/cameraStore';
import { countThreadReplies } from '../hooks/useThread';
import { SendEffectPicker } from '../effects/SendEffectPicker';
import { ScreenEffectOverlay, type ActiveScreenEffect } from '../effects/ScreenEffects';
import { effectFromMetadata, type MessageEffect } from '../effects/effectCatalog';
import { MediaMessage } from '../media/MediaMessage';
import {
  CHAT_MEDIA_LIMITS,
  MediaRejectedError,
  uploadChatMedia,
  type OutgoingMedia,
} from '../media/chatMedia';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Contacts from 'expo-contacts';
import * as Clipboard from 'expo-clipboard';
import { AudioMessagePlayer } from './AudioMessagePlayer';
import { VideoMessagePlayer } from './VideoMessagePlayer';

import type { ChatConversation, ChatMessagesPage } from '../types';

interface ChatScreenProps {
  /**
   * Always a resolved, non-empty conversation id. Callers must NOT render
   * `ChatScreen` directly with raw navigation params — the `/chat` route
   * resolves (idempotent get-or-create) via `useConversationId` first. Passing
   * an empty string here disables every data hook (the "black screen" bug).
   */
  conversationId: string;
  participantName: string;
  participantId?: string;
  participantAvatar?: string | null;
  /** Rendered inline in iPad split-view (hides back button, skips router.back) */
  inline?: boolean;
}

/**
 * One clear line per refusal: what happened and what would fit, never a
 * bare error code.
 */
/** A screen effect only fires for a message that just arrived. */
const SCREEN_EFFECT_FRESH_MS = 60_000;

function mediaLimitMessage(
  error: MediaRejectedError,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  switch (error.reason) {
    case 'video_too_long':
      return t('mediaLimits.videoTooLong', {
        minutes: Math.round(CHAT_MEDIA_LIMITS.videoMaxDurationMs / 60000),
      });
    case 'video_too_big':
      return t('mediaLimits.videoTooBig', {
        mb: Math.round(CHAT_MEDIA_LIMITS.videoMaxBytes / (1024 * 1024)),
        actual: Math.round((error.detail.bytes ?? 0) / (1024 * 1024)),
      });
    case 'file_too_big':
      return t('mediaLimits.fileTooBig', {
        mb: Math.round(CHAT_MEDIA_LIMITS.fileMaxBytes / (1024 * 1024)),
        actual: Math.round((error.detail.bytes ?? 0) / (1024 * 1024)),
      });
    case 'audio_too_long':
      return t('mediaLimits.audioTooLong', {
        minutes: Math.round(CHAT_MEDIA_LIMITS.audioMaxDurationMs / 60000),
      });
    default:
      return t('mediaLimits.generic');
  }
}

export function ChatScreen({
  conversationId,
  participantName,
  participantId,
  participantAvatar,
  inline,
}: ChatScreenProps) {
  const { t } = useTranslation('messages');
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const userId = user ? String(user.id) : '';
  const insets = useSafeAreaInsets();

  // Data hooks
  const {
    messages,
    isLoading,
    isFetchingMore,
    hasMore,
    sendMessageAsync,
    isSending,
    loadMore,
    refresh,
  } = useChat(conversationId);
  const { sendViaSocket, markRead, sendTyping } = useRealtimeChat(conversationId);
  const { toggleReaction } = useReactions(conversationId);
  const { editMessage, deleteMessage, canEditOrDelete } =
    useMessageActions(conversationId);

  // UI state
  const [selectedMessage, setSelectedMessage] = useState<AttoMessage | null>(null);
  const [emojiPickerVisible, setEmojiPickerVisible] = useState(false);
  const [editingMessage, setEditingMessage] = useState<AttoMessage | null>(null);
  const [replyMessage, setReplyMessage] = useState<AttoMessage | null>(null);

  // Composer state. The native field owns the text (see ChatComposer); the
  // draft ref mirrors it and survives toolbar remounts, and `composerGeneration`
  // forces a remount whenever we need to REPLACE the content (edit mode).
  const composerRef = useRef<ChatComposerHandle>(null);
  // The unsent draft comes back when the chat is reopened (WhatsApp and
  // Telegram keep it per conversation and flag it in the list).
  const setStoredDraft = useConversationPrefsStore((s) => s.setDraft);
  const draftRef = useRef(
    useConversationPrefsStore.getState().drafts[conversationId] ?? ''
  );
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistDraft = useCallback(
    (text: string) => {
      if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
      draftSaveTimer.current = setTimeout(() => {
        const had = !!useConversationPrefsStore.getState().drafts[conversationId];
        setStoredDraft(conversationId, text);
        if (!!text.trim() !== had) {
          analytics.capture(ANALYTICS_EVENTS.MESSAGES.DRAFT_SAVED, {
            conversation_id: conversationId,
            has_text: !!text.trim(),
            length: text.trim().length,
          });
        }
      }, 400);
    },
    [conversationId, setStoredDraft]
  );
  useEffect(
    () => () => {
      // Leaving the screen: flush whatever the field holds right now.
      if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
      setStoredDraft(conversationId, draftRef.current);
    },
    [conversationId, setStoredDraft]
  );
  const [composerGeneration, setComposerGeneration] = useState(0);
  // The message this device just sent slides in from the composer (iMessage).
  const [justSentId, setJustSentId] = useState<string | null>(null);
  const [tapback, setTapback] = useState<{ message: AttoMessage; rect: Anchor } | null>(
    null
  );
  const threadRef = useRef<ChatThreadHandle>(null);
  // Unread count at open time, from the list cache, for the "new messages"
  // line. Frozen in a ref so marking as read does not move the line.
  const initialUnreadRef = useRef<number | null>(null);
  if (initialUnreadRef.current === null) {
    const cached = queryClient.getQueryData<ChatConversation[]>(
      QUERY_KEYS.MESSAGES.CONVERSATIONS()
    );
    initialUnreadRef.current =
      cached?.find((c) => c.conversationId === conversationId)?.unreadCount ?? 0;
  }
  // Creators' bubbles wear the creator gold (David, Sep 21 2026).
  const participantProfile = useParticipantProfile(participantId || '');
  const creatorIds = useMemo(() => {
    const ids = new Set<string>();
    if (user?.role === 'creator') ids.add(userId);
    if (participantProfile.role === 'creator' && participantId)
      ids.add(String(participantId));
    return ids;
  }, [user?.role, userId, participantProfile.role, participantId]);

  // Chat wallpaper — remote-managed, user picks from the settings gear
  // on the messages tab (ConversationsHeader).
  // `null` selectedWallpaperId means no explicit user choice yet, so we use
  // the first active wallpaper from the backend catalogue as global default.
  // `CHAT_WALLPAPER_NONE_ID` means user explicitly chose black/no wallpaper.
  const { data: wallpapersCatalogue = [] } = useChatWallpapers();
  const globalWallpaperId = useChatWallpaperStore((s) => s.selectedWallpaperId);
  const perConversationWallpaper = useChatWallpaperStore((s) => s.perConversation);
  const selectedWallpaperId = useMemo(
    () =>
      resolveWallpaperChoice(
        {
          selectedWallpaperId: globalWallpaperId,
          perConversation: perConversationWallpaper,
        },
        conversationId
      ) ?? null,
    [globalWallpaperId, perConversationWallpaper, conversationId]
  );
  const [wallpaperPickerVisible, setWallpaperPickerVisible] = useState(false);
  const activeWallpaper = useMemo(() => {
    if (selectedWallpaperId === CHAT_WALLPAPER_NONE_ID) return null;
    // A choice that points at a wallpaper the admin retired falls back to
    // the global choice, then to the catalogue default, never to black.
    const pick = (id: string | null | undefined) =>
      id && id !== CHAT_WALLPAPER_NONE_ID
        ? (wallpapersCatalogue.find((w) => w.id === id) ?? null)
        : null;
    return (
      pick(selectedWallpaperId) ??
      (globalWallpaperId === CHAT_WALLPAPER_NONE_ID ? null : pick(globalWallpaperId)) ??
      wallpapersCatalogue[0] ??
      null
    );
  }, [selectedWallpaperId, globalWallpaperId, wallpapersCatalogue]);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const sentMessageIds = useRef(new Set<string>()).current;

  // Typing state
  const typingUsers = useChatStore((s) => s.typingUsers[conversationId]);
  const readAt = useChatStore((s) => s.readAt[conversationId] ?? null);
  const isParticipantTyping = typingUsers ? typingUsers.size > 0 : false;

  // Force refetch on mount
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      refresh();
    }
  }, [refresh]);

  // Mark as read
  useEffect(() => {
    if (messages.length === 0 || !conversationId) return;
    messageService
      .markRead(conversationId)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MESSAGES.CONVERSATIONS() });
        const store = useChatStore.getState();
        if (store.totalUnread > 0) {
          messageService
            .getConversations()
            .then((convs) => {
              store.setTotalUnread(convs.reduce((sum, c) => sum + c.unreadCount, 0));
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
    markRead();
    if (participantId) {
      notificationService
        .markReadByActor('message', participantId)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.NOTIFICATIONS.ALL });
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.NOTIFICATIONS.UNREAD });
          notificationService
            .getUnreadCount()
            .then((c) => {
              useNotificationStore.getState().setUnreadCount(c);
            })
            .catch(() => {});
        })
        .catch(() => {});
    }
  }, [messages.length, conversationId, participantId, markRead, queryClient]);

  // Convert messages to gifted-chat format
  // Slack style threads: replies live in their own screen, the main list
  // only shows the root with a "N replies" footer.
  const threadCounts = useMemo(() => countThreadReplies(messages), [messages]);
  const mainMessages = useMemo(() => messages.filter((m) => !m.threadId), [messages]);
  const giftedMessages = toGiftedMessages(
    mainMessages,
    userId,
    participantName,
    participantAvatar
  );
  const openThread = useCallback(
    (threadId: string) => {
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.THREAD_STARTED, {
        conversation_id: conversationId,
        thread_id: threadId,
        existing_replies: threadCounts.get(threadId) ?? 0,
      });
      router.push({
        pathname: '/chat-thread',
        params: { conversationId, threadId, participantId, participantName },
      });
    },
    [conversationId, participantId, participantName, threadCounts]
  );

  // ── Handlers ──

  const handleSend = useCallback(
    async (newMessages: IMessage[] = [], effect?: MessageEffect) => {
      const content = (newMessages[0]?.text ?? '').trim();
      if (!content) return;
      if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
      draftRef.current = '';
      setStoredDraft(conversationId, '');

      // Stop typing indicator on send
      if (isTypingRef.current) {
        isTypingRef.current = false;
        sendTyping(false);
      }
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

      // Edit mode — update existing message
      if (editingMessage) {
        try {
          await editMessage(editingMessage._id as string, content);
          analytics.capture(ANALYTICS_EVENTS.MESSAGES.EDIT_COMPLETED, {
            conversation_id: conversationId,
            message_id: editingMessage._id,
          });
        } catch {
          analytics.capture(ANALYTICS_EVENTS.MESSAGES.EDIT_FAILED, {
            conversation_id: conversationId,
            message_id: editingMessage._id,
          });
        }
        setEditingMessage(null);
        composerRef.current?.clear();
        return;
      }

      // The composer already cleared itself; drop the reply preview now.
      const currentReply = replyMessage;
      setReplyMessage(null);

      // Optimistic insert
      const tempId = `temp-${Date.now()}`;
      sentMessageIds.add(tempId);
      setJustSentId(tempId);
      const chatKey = QUERY_KEYS.MESSAGES.CHAT(conversationId);

      const replaceTempWith = (realId: string, status: 'sent' | 'failed') => {
        setJustSentId((cur) => (cur === tempId ? realId || tempId : cur));
        queryClient.setQueryData(
          chatKey,
          (old: { pages: ChatMessagesPage[]; pageParams: unknown[] } | undefined) => {
            if (!old) return old;
            return {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                messages: page.messages.map((m) =>
                  m.messageId === tempId
                    ? { ...m, messageId: realId || tempId, status }
                    : m
                ),
              })),
            };
          }
        );
      };

      queryClient.setQueryData(
        chatKey,
        (old: { pages: ChatMessagesPage[]; pageParams: unknown[] } | undefined) => {
          // An empty cache used to swallow the row in silence (after a
          // reload the message only came back on the next fetch): seed the
          // first page instead of walking away.
          const base = old?.pages?.length
            ? old
            : {
                pages: [{ messages: [], nextCursor: null, hasMore: false }],
                pageParams: [undefined],
              };
          return {
            ...base,
            pages: [
              {
                ...base.pages[0],
                messages: [
                  {
                    conversationId,
                    messageId: tempId,
                    clientKey: tempId,
                    senderId: userId,
                    content,
                    replyToId: currentReply?._id as string | undefined,
                    replyToContent: currentReply?.text,
                    replyToSender: currentReply?.user.name || undefined,
                    contentType: 'text',
                    metadata: effect ? { effect } : undefined,
                    isRead: false,
                    createdAt: new Date().toISOString(),
                    status: 'sending' as const,
                  },
                  ...base.pages[0].messages,
                ],
              },
              ...base.pages.slice(1),
            ],
          };
        }
      );

      // Build reply reference if replying
      const replyTo = currentReply
        ? {
            id: currentReply._id as string,
            content: currentReply.text,
            sender: currentReply.user.name || '',
          }
        : undefined;

      const isReply = !!replyTo;
      const msgProps = {
        conversation_id: conversationId,
        is_reply: isReply,
        content_type: 'text',
      };

      // Send via WebSocket, replace temp on success
      try {
        const serverMsg = await sendViaSocket(
          content,
          'text',
          replyTo,
          effect ? { metadata: { effect } } : undefined
        );
        replaceTempWith(serverMsg.messageId, 'sent');
        analytics.capture(
          isReply
            ? ANALYTICS_EVENTS.MESSAGES.REPLY_SENT
            : ANALYTICS_EVENTS.MESSAGES.MESSAGE_SENT,
          { ...msgProps, message_id: serverMsg.messageId, transport: 'websocket' }
        );
      } catch (wsError) {
        analytics.capture(ANALYTICS_EVENTS.MESSAGES.MESSAGE_SEND_FALLBACK_REST, {
          ...msgProps,
          ws_error: wsError instanceof Error ? wsError.message : 'unknown',
        });
        try {
          const restMsg = await messageService.sendMessage({
            conversationId,
            content,
            contentType: 'text',
            metadata: effect ? { effect } : undefined,
          });
          replaceTempWith(restMsg.messageId, 'sent');
          analytics.capture(
            isReply
              ? ANALYTICS_EVENTS.MESSAGES.REPLY_SENT
              : ANALYTICS_EVENTS.MESSAGES.MESSAGE_SENT,
            { ...msgProps, message_id: restMsg.messageId, transport: 'rest_fallback' }
          );
        } catch (restError) {
          replaceTempWith(tempId, 'failed');
          showToast(t('chat.errorFailedToSend'));
          analytics.capture(ANALYTICS_EVENTS.MESSAGES.MESSAGE_SEND_FAILED, {
            ...msgProps,
            ws_error: wsError instanceof Error ? wsError.message : 'unknown',
            rest_error: restError instanceof Error ? restError.message : 'unknown',
          });
        }
      }
    },
    [
      conversationId,
      userId,
      sendViaSocket,
      sendTyping,
      queryClient,
      sentMessageIds,
      editingMessage,
      editMessage,
      replyMessage,
      t,
    ]
  );

  // Pinned messages: the bar under the header and the menu state. Both
  // sides stay in step through the channel (see useRealtimeChat).
  const { pinned, pin, unpin } = usePinnedMessages(conversationId);
  const pinnedIds = useMemo(
    () => new Set(pinned.map((m) => String(m.messageId))),
    [pinned]
  );

  const handleMenuAction = useCallback(
    (actionKey: string, msg: AttoMessage) => {
      const eventProps = {
        conversation_id: conversationId,
        message_id: msg._id,
        action: actionKey,
      };
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.CONTEXT_MENU_ACTION, eventProps);

      switch (actionKey) {
        case 'react':
          setSelectedMessage(msg);
          setEmojiPickerVisible(true);
          break;
        case 'reply':
          setReplyMessage(msg);
          analytics.capture(ANALYTICS_EVENTS.MESSAGES.REPLY_STARTED, eventProps);
          break;
        case 'thread':
          openThread(String(msg._id));
          break;
        case 'pin':
          pin(String(msg._id));
          showToast(t('pinned.pinned'));
          break;
        case 'unpin':
          unpin(String(msg._id));
          showToast(t('pinned.unpinned'));
          break;
        case 'copy':
          Clipboard.setStringAsync(msg.text);
          showToast(t('actions.copied', { defaultValue: 'Copied' }));
          analytics.capture(ANALYTICS_EVENTS.MESSAGES.MESSAGE_COPIED, eventProps);
          break;
        case 'edit':
          // Load the message into the composer by remounting the native
          // field with the new draft (never through a controlled value).
          draftRef.current = msg.text;
          setComposerGeneration((g) => g + 1);
          setEditingMessage(msg);
          analytics.capture(ANALYTICS_EVENTS.MESSAGES.EDIT_STARTED, eventProps);
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
                onPress: () => {
                  deleteMessage(msg._id as string);
                  analytics.capture(
                    ANALYTICS_EVENTS.MESSAGES.DELETE_CONFIRMED,
                    eventProps
                  );
                },
              },
            ]
          );
          break;
      }
    },
    [conversationId, deleteMessage, t, pin, unpin]
  );

  const handleBack = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MESSAGES.CONVERSATIONS() });
    if (!inline) router.back();
  }, [queryClient, inline]);

  // ── Custom renderers ──

  // Typing indicator, driven by the composer's keystrokes.
  const handleTypingActivity = useCallback(
    (text: string) => {
      draftRef.current = text;
      persistDraft(text);
      if (text.length > 0 && !isTypingRef.current) {
        isTypingRef.current = true;
        sendTyping(true);
      }
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        if (isTypingRef.current) {
          isTypingRef.current = false;
          sendTyping(false);
        }
      }, 2000);
    },
    [sendTyping, persistDraft]
  );

  const cancelEditing = useCallback(() => {
    composerRef.current?.clear();
    setEditingMessage(null);
    analytics.capture(ANALYTICS_EVENTS.MESSAGES.EDIT_CANCELLED, {
      conversation_id: conversationId,
    });
  }, [conversationId]);

  // ── Effects (iMessage style) ────────────────────────────────────────
  // Only a message that just landed carries its effect; older ones are
  // history and stay quiet (iMessage never replays on reopen).
  // Hold the send button to pick one; it rides in the message metadata and
  // plays once, for both sides, when the message shows up.
  const [effectDraft, setEffectDraft] = useState<string | null>(null);
  const [screenEffect, setScreenEffect] = useState<ActiveScreenEffect | null>(null);
  // Everything already in the thread when the chat opens counts as seen:
  // iMessage plays an effect when the message arrives, never again on the
  // way back into the conversation.
  const effectsSeeded = useRef(false);
  useEffect(() => {
    if (!messages.length) return;
    if (!effectsSeeded.current) {
      effectsSeeded.current = true;
      for (const msg of messages) markEffectPlayed(msg.messageId);
      return;
    }
    for (const msg of messages) {
      const effect = effectFromMetadata(msg.metadata);
      if (!effect || effect.kind !== 'screen') continue;
      if (hasEffectPlayed(msg.messageId)) continue;
      markEffectPlayed(msg.messageId);
      const stamped = msg.createdAt ? Date.parse(String(msg.createdAt)) : NaN;
      const age = Number.isNaN(stamped) ? Infinity : Date.now() - stamped;
      if (!(age >= 0 && age < SCREEN_EFFECT_FRESH_MS)) continue;
      setScreenEffect({ name: effect.name, messageId: msg.messageId, text: msg.content });
      break;
    }
  }, [messages]);
  const replayEffect = useCallback((message: AttoMessage) => {
    const effect = effectFromMetadata(message.metadata);
    if (!effect) return;
    analytics.capture(ANALYTICS_EVENTS.MESSAGES.EFFECT_REPLAYED, {
      kind: effect.kind,
      name: effect.name,
      message_id: String(message._id),
    });
    if (effect.kind === 'screen') {
      setScreenEffect({
        name: effect.name,
        messageId: String(message._id),
        text: message.text,
      });
    }
  }, []);

  // ── Attachments and voice notes ─────────────────────────────────────

  /**
   * Optimistic media message: the local file shows in the bubble at once
   * (status sending), then the upload and the send replace it with the
   * hosted copy. Failures keep the row with status failed.
   */
  const handleSendMedia = useCallback(
    async (media: OutgoingMedia) => {
      const tempId = `temp-${Date.now()}`;
      const chatKey = QUERY_KEYS.MESSAGES.CHAT(conversationId);
      const localContent =
        media.kind === 'contact'
          ? JSON.stringify(media.contact ?? {})
          : (media.uri ?? '');
      const localMetadata = {
        durationMs: media.durationMs,
        waveform: media.waveform,
        width: media.width,
        height: media.height,
        fileName: media.fileName,
        bytes: media.bytes,
        contact: media.contact,
      };
      sentMessageIds.add(tempId);
      setJustSentId(tempId);
      queryClient.setQueryData(
        chatKey,
        (old: { pages: ChatMessagesPage[]; pageParams: unknown[] } | undefined) => {
          // An empty cache used to swallow the row in silence (after a
          // reload the message only came back on the next fetch): seed the
          // first page instead of walking away.
          const base = old?.pages?.length
            ? old
            : {
                pages: [{ messages: [], nextCursor: null, hasMore: false }],
                pageParams: [undefined],
              };
          return {
            ...base,
            pages: [
              {
                ...base.pages[0],
                messages: [
                  {
                    conversationId,
                    messageId: tempId,
                    clientKey: tempId,
                    senderId: userId,
                    content: localContent,
                    contentType: media.kind,
                    metadata: localMetadata,
                    isRead: false,
                    createdAt: new Date().toISOString(),
                    status: 'sending' as const,
                  },
                  ...base.pages[0].messages,
                ],
              },
              ...base.pages.slice(1),
            ],
          };
        }
      );
      // Granular by design: when a media row does not show up, this says
      // whether it ever entered the cache and how many rows the first page
      // had afterwards.
      {
        const after = queryClient.getQueryData<{ pages: ChatMessagesPage[] }>(chatKey);
        analytics.capture(ANALYTICS_EVENTS.MESSAGES.OPTIMISTIC_ROW_ADDED, {
          conversation_id: conversationId,
          kind: media.kind,
          temp_id: tempId,
          pages: after?.pages?.length ?? 0,
          first_page_rows: after?.pages?.[0]?.messages?.length ?? 0,
          has_temp: !!after?.pages?.[0]?.messages?.some((m) => m.messageId === tempId),
        });
      }
      const patchTemp = (patch: Record<string, unknown>) =>
        queryClient.setQueryData(
          chatKey,
          (old: { pages: ChatMessagesPage[]; pageParams: unknown[] } | undefined) => {
            if (!old) return old;
            return {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                // Match on the client key too: the channel echo may have
                // already swapped the temp id for the server one.
                messages: page.messages.map((m) =>
                  m.messageId === tempId || m.clientKey === tempId
                    ? { ...m, ...patch }
                    : m
                ),
              })),
            };
          }
        );
      const dropTemp = () =>
        queryClient.setQueryData(
          chatKey,
          (old: { pages: ChatMessagesPage[]; pageParams: unknown[] } | undefined) => {
            if (!old) return old;
            return {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                messages: page.messages.filter(
                  (m) => m.messageId !== tempId && m.clientKey !== tempId
                ),
              })),
            };
          }
        );
      threadRef.current?.scrollToBottom(true);
      try {
        const { content, metadata } = await uploadChatMedia(media, conversationId);
        const sent = await messageService.sendMessage({
          conversationId,
          content,
          contentType: media.kind,
          metadata,
        });
        sentMessageIds.add(sent.messageId);
        // The channel echo may have landed first with the real id: keep one row.
        queryClient.setQueryData(
          chatKey,
          (old: { pages: ChatMessagesPage[]; pageParams: unknown[] } | undefined) => {
            if (!old) return old;
            return {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                messages: page.messages.filter(
                  (m) => !(m.messageId === sent.messageId && m.messageId !== tempId)
                ),
              })),
            };
          }
        );
        patchTemp({ messageId: sent.messageId, content, metadata, status: 'sent' });
        setJustSentId((cur) => (cur === tempId ? sent.messageId : cur));
        analytics.capture(ANALYTICS_EVENTS.MESSAGES.MEDIA_MESSAGE_SENT, {
          conversation_id: conversationId,
          kind: media.kind,
          duration_ms: media.durationMs ?? null,
          bytes: metadata.bytes ?? null,
        });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MESSAGES.CONVERSATIONS() });
      } catch (error) {
        // A refusal we can explain (too long, too heavy) gets its own line
        // and takes the row out of the thread, instead of a red tick with
        // no reason.
        if (error instanceof MediaRejectedError) {
          dropTemp();
          analytics.capture(ANALYTICS_EVENTS.MESSAGES.MEDIA_REJECTED, {
            conversation_id: conversationId,
            kind: media.kind,
            reason: error.reason,
            ...error.detail,
          });
          Alert.alert(
            t('mediaLimits.title'),
            mediaLimitMessage(
              error,
              t as unknown as (key: string, options?: Record<string, unknown>) => string
            )
          );
          return;
        }
        patchTemp({ status: 'failed' });
        analytics.capture(ANALYTICS_EVENTS.MESSAGES.MEDIA_MESSAGE_FAILED, {
          conversation_id: conversationId,
          kind: media.kind,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [conversationId, userId, queryClient, t]
  );

  // The camera is our own screen (ChatGPT's chrome, WhatsApp's round video
  // note), not the system picker: it opens as a route and leaves the capture
  // in the store.
  const openCamera = useCallback(
    (mode: CameraMode) => {
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.CAMERA_OPENED, {
        conversation_id: conversationId,
        mode,
      });
      // The card sits over the conversation: the keyboard has to go first.
      Keyboard.dismiss();
      useCameraStore.getState().open(conversationId, mode);
      router.push('/chat-camera');
    },
    [conversationId]
  );

  const cameraResult = useCameraStore((s) => s.result);
  useEffect(() => {
    if (!cameraResult || cameraResult.conversationId !== conversationId) return;
    useCameraStore.getState().consume();
    void handleSendMedia(cameraResult.media);
  }, [cameraResult, conversationId, handleSendMedia]);

  const handleAttachPick = useCallback(
    async (action: AttachAction) => {
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.ATTACH_MENU_PICKED, {
        conversation_id: conversationId,
        action,
      });
      const fromAsset = (
        asset: ImagePicker.ImagePickerAsset,
        kind: OutgoingMedia['kind']
      ): OutgoingMedia => ({
        kind,
        uri: asset.uri,
        mime: asset.mimeType ?? undefined,
        fileName: asset.fileName ?? undefined,
        bytes: asset.fileSize,
        width: asset.width,
        height: asset.height,
        durationMs: asset.duration ? Math.round(asset.duration) : undefined,
      });
      try {
        if (action === 'camera') {
          openCamera('photo');
        } else if (action === 'photos') {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) return Alert.alert(t('media.permissionPhotos'));
          const res = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images', 'videos'],
            quality: 0.85,
            allowsMultipleSelection: true,
            selectionLimit: 5,
          });
          if (!res.canceled) {
            for (const asset of res.assets ?? []) {
              void handleSendMedia(
                fromAsset(asset, asset.type === 'video' ? 'video' : 'image')
              );
            }
          }
        } else if (action === 'video_note') {
          openCamera('video_note');
        } else if (action === 'voice') {
          Alert.alert(t('composer.voiceNote'), t('media.recordingHint'));
        } else if (action === 'file') {
          const res = await DocumentPicker.getDocumentAsync({
            copyToCacheDirectory: true,
            multiple: false,
          });
          const asset = res.assets?.[0];
          if (!res.canceled && asset) {
            void handleSendMedia({
              kind: 'file',
              uri: asset.uri,
              mime: asset.mimeType,
              fileName: asset.name,
              bytes: asset.size,
            });
          }
        } else if (action === 'contact') {
          const perm = await Contacts.requestPermissionsAsync();
          if (!perm.granted) return Alert.alert(t('media.permissionContacts'));
          const picked = await Contacts.presentContactPickerAsync();
          if (picked) {
            void handleSendMedia({
              kind: 'contact',
              contact: {
                name:
                  picked.name ??
                  [picked.firstName, picked.lastName].filter(Boolean).join(' '),
                phone: picked.phoneNumbers?.[0]?.number ?? undefined,
                email: picked.emails?.[0]?.email ?? undefined,
              },
            });
          }
        } else {
          Alert.alert(t('composer.comingSoonTitle'), t('composer.comingSoonBody'));
        }
      } catch (error) {
        analytics.capture(ANALYTICS_EVENTS.MESSAGES.MEDIA_MESSAGE_FAILED, {
          conversation_id: conversationId,
          kind: action,
          stage: 'pick',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [conversationId, handleSendMedia, openCamera, t]
  );

  // Reply and edit previews sit inside the composer's glass capsule (Telegram).
  const composerPreview = (
    <>
      {editingMessage && (
        <View style={styles.replyPreview}>
          <View style={[styles.replyPreviewBar, styles.editPreviewBarColor]} />
          <View style={styles.replyPreviewContent}>
            <View style={styles.editPreviewHeader}>
              <Pencil size={13} color="#FFFFFF" strokeWidth={2} />
              <Text style={styles.editPreviewLabel}>
                {t('actions.editing', { defaultValue: 'Editing' })}
              </Text>
            </View>
            <Text style={styles.replyPreviewText} numberOfLines={1}>
              {editingMessage.text}
            </Text>
          </View>
          <TouchableOpacity onPress={cancelEditing} style={styles.replyPreviewClose}>
            <X size={18} color="#888" strokeWidth={2} />
          </TouchableOpacity>
        </View>
      )}
    </>
  );

  // The toolbar has no background of its own: the wallpaper runs under it
  // and the composer's glass floats on top (iOS 26 Messages, Telegram).
  // Telegram and iMessage sit the composer right on the keyboard: the home
  // indicator inset only applies while the keyboard is down.
  const { progress: keyboardProgress } = useReanimatedKeyboardAnimation();
  const toolbarInset = useAnimatedStyle(() => ({
    paddingBottom:
      Math.max(insets.bottom, 12) * (1 - keyboardProgress.value) +
      8 * keyboardProgress.value,
  }));
  const inputToolbar = (
    <Animated.View style={[styles.inputToolbarOuter, toolbarInset]}>
      <ChatComposer
        ref={composerRef}
        conversationId={conversationId}
        draftRef={draftRef}
        generation={composerGeneration}
        focusOnGeneration={editingMessage != null}
        placeholder={
          editingMessage
            ? t('chat.editPlaceholder', { defaultValue: 'Edit message...' })
            : t('chat.inputPlaceholder', { defaultValue: 'Message...' })
        }
        // Hand the text to GiftedChat so it stamps user/id/createdAt and
        // scrolls to bottom before our handleSend runs. `false` = we clear
        // the field ourselves (GiftedChat never touches the native input).
        // GiftedChat injects `onSend` at runtime but leaves it out of the
        // InputToolbarProps type, hence the narrow cast with a fallback.
        onSend={(text) => {
          void handleSend([{ text } as IMessage]);
          threadRef.current?.scrollToBottom(true);
        }}
        onTextActivity={handleTypingActivity}
        preview={composerPreview}
        onAttachPress={() => {
          analytics.capture(ANALYTICS_EVENTS.MESSAGES.ATTACH_MENU_OPENED, {
            conversation_id: conversationId,
          });
        }}
        onAttachPick={(action) => void handleAttachPick(action)}
        onSendMedia={handleSendMedia}
        onSendWithEffect={(text) => setEffectDraft(text)}
        onCameraPress={() => void handleAttachPick('camera')}
        onVideoNotePress={() => void handleAttachPick('video_note')}
      />
    </Animated.View>
  );

  const menuItemsFor = useCallback(
    (_msg: AttoMessage, isOwn: boolean): MenuItem[] => {
      const items: MenuItem[] = [
        {
          actionKey: 'react',
          actionTitle: t('actions.react', { defaultValue: 'React' }),
          icon: { type: 'IMAGE_SYSTEM', imageValue: { systemName: 'face.smiling' } },
        },
        {
          actionKey: 'reply',
          actionTitle: t('actions.reply', { defaultValue: 'Reply' }),
          icon: {
            type: 'IMAGE_SYSTEM',
            imageValue: { systemName: 'arrowshape.turn.up.left' },
          },
        },
        {
          actionKey: 'copy',
          actionTitle: t('actions.copy', { defaultValue: 'Copy' }),
          icon: { type: 'IMAGE_SYSTEM', imageValue: { systemName: 'doc.on.doc' } },
        },
        {
          actionKey: 'thread',
          actionTitle: t('thread.menu'),
          icon: { type: 'IMAGE_SYSTEM', imageValue: { systemName: 'text.bubble' } },
        },
        {
          actionKey: pinnedIds.has(String(_msg._id)) ? 'unpin' : 'pin',
          actionTitle: pinnedIds.has(String(_msg._id))
            ? t('pinned.unpin')
            : t('pinned.pin'),
          icon: {
            type: 'IMAGE_SYSTEM',
            imageValue: {
              systemName: pinnedIds.has(String(_msg._id)) ? 'pin.slash' : 'pin',
            },
          },
        },
      ];
      if (isOwn) {
        items.push({
          actionKey: 'edit',
          actionTitle: t('actions.edit', { defaultValue: 'Edit' }),
          icon: { type: 'IMAGE_SYSTEM', imageValue: { systemName: 'pencil' } },
        });
        items.push({
          actionKey: 'delete',
          actionTitle: t('actions.delete', { defaultValue: 'Delete' }),
          icon: { type: 'IMAGE_SYSTEM', imageValue: { systemName: 'trash' } },
          menuAttributes: ['destructive'],
        });
      }
      return items;
    },
    [pinnedIds, t]
  );

  const handleSwipeReply = useCallback(
    (msg: AttoMessage) => {
      setReplyMessage(msg);
      composerRef.current?.focus();
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.REPLY_STARTED, {
        conversation_id: conversationId,
        message_id: msg._id,
        action: 'swipe',
      });
    },
    [conversationId]
  );

  const handleDoubleTapReact = useCallback(
    (msg: AttoMessage, rect: Anchor) => {
      setTapback({ message: msg, rect });
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.TAPBACK_OPENED, {
        conversation_id: conversationId,
        message_id: msg._id,
        anchor_y: Math.round(rect.y),
        existing_reactions: msg.reactions?.length ?? 0,
      });
    },
    [conversationId]
  );
  const tapbackMine = useMemo(() => {
    const set = new Set<string>();
    tapback?.message.reactions?.forEach((r) => {
      if (String(r.userId) === userId) set.add(r.emoji);
    });
    return set;
  }, [tapback, userId]);

  const handleToggleReaction = useCallback(
    (msg: AttoMessage, emoji: string) =>
      toggleReaction(msg._id as string, emoji, msg.reactions),
    [toggleReaction]
  );

  const renderThreadMedia = useCallback(
    // `onLight` comes from the row: a creator's bubble is gold on both
    // sides, so the media's own ink follows the bubble, not who sent it.
    (msg: AttoMessage, onLight: boolean) => {
      if (!msg.contentType || msg.contentType === 'text') return null;
      return <MediaMessage message={msg} isOwn={onLight} />;
    },
    []
  );

  if (!user) return null;

  // The wallpaper sits behind the thread; the layer handles image, gradient
  // and pattern kinds and turns the gradient on each sent message.
  const wallpaperLayer = (
    <ChatWallpaperLayer wallpaper={activeWallpaper} sendPulse={justSentId} />
  );

  return (
    <View style={styles.container}>
      {wallpaperLayer}

      <SendEffectPicker
        text={effectDraft}
        onCancel={() => setEffectDraft(null)}
        onSend={(text, effect) => {
          setEffectDraft(null);
          composerRef.current?.clear();
          void handleSend([{ text } as IMessage], effect);
          threadRef.current?.scrollToBottom(true);
        }}
      />
      <WallpaperPickerSheet
        visible={wallpaperPickerVisible}
        onClose={() => setWallpaperPickerVisible(false)}
        conversationId={conversationId}
      />
      {/* Telegram's blurred top band, under the header pills. It grows when
          the pinned bar is up so the band still ends below everything. */}
      <TopFadeBlur height={insets.top + (pinned.length ? 164 : 108)} />
      <PinnedBar
        pinned={pinned}
        top={insets.top + 56}
        onOpen={(message) => {
          analytics.capture(ANALYTICS_EVENTS.MESSAGES.PINNED_BAR_TAPPED, {
            conversation_id: conversationId,
            message_id: message.messageId,
          });
          threadRef.current?.scrollToMessage?.(message.messageId);
        }}
        onUnpin={(message) => {
          unpin(message.messageId);
          showToast(t('pinned.unpinned'));
        }}
      />
      <ChatHeader
        onOpenWallpaper={() => setWallpaperPickerVisible(true)}
        participantName={participantName}
        participantId={participantId || ''}
        onBack={handleBack}
        hideBack={inline}
      />

      <KeyboardAvoidingView behavior="padding" style={styles.threadArea}>
        <ChatThread
          ref={threadRef}
          messages={giftedMessages}
          currentUserId={userId}
          initialUnreadCount={initialUnreadRef.current ?? 0}
          threadCounts={threadCounts}
          onOpenThread={openThread}
          onReplayEffect={replayEffect}
          justSentId={justSentId}
          creatorIds={creatorIds}
          isParticipantTyping={isParticipantTyping}
          participantName={participantName}
          hasMore={hasMore}
          isFetchingMore={isFetchingMore}
          onLoadMore={loadMore}
          menuItemsFor={menuItemsFor}
          onMenuAction={handleMenuAction}
          onReply={handleSwipeReply}
          onDoubleTap={handleDoubleTapReact}
          onToggleReaction={handleToggleReaction}
          renderMedia={renderThreadMedia}
          focusedId={replyMessage ? String(replyMessage._id) : null}
          readAt={readAt}
          bottomInset={0}
          topInset={0}
        />
        {/* iMessage: answering one message takes the rest out of focus and
            floats it over the composer. */}
        <ReplyFocus
          message={editingMessage ? null : replyMessage}
          isOwn={replyMessage ? String(replyMessage.user._id) === userId : false}
          senderIsCreator={
            replyMessage ? creatorIds.has(String(replyMessage.user._id)) : false
          }
          onCancel={() => setReplyMessage(null)}
        />
        {inputToolbar}
      </KeyboardAvoidingView>

      <TapbackOverlay
        anchor={tapback?.rect ?? null}
        mine={tapbackMine}
        onPick={(emoji) => {
          if (tapback) {
            toggleReaction(
              tapback.message._id as string,
              emoji,
              tapback.message.reactions
            );
            analytics.capture(ANALYTICS_EVENTS.MESSAGES.TAPBACK_PICKED, {
              conversation_id: conversationId,
              message_id: tapback.message._id,
              emoji,
              already_mine: tapbackMine.has(emoji),
            });
          }
          setTapback(null);
        }}
        onMore={() => {
          if (tapback) setSelectedMessage(tapback.message);
          setTapback(null);
          setEmojiPickerVisible(true);
        }}
        onClose={() => {
          analytics.capture(ANALYTICS_EVENTS.MESSAGES.TAPBACK_DISMISSED, {
            conversation_id: conversationId,
            message_id: tapback?.message._id ?? null,
          });
          setTapback(null);
        }}
      />

      <ReactionPicker
        visible={emojiPickerVisible}
        onSelect={(emoji) => {
          if (selectedMessage) {
            toggleReaction(
              selectedMessage._id as string,
              emoji,
              selectedMessage.reactions ?? []
            );
          }
          setEmojiPickerVisible(false);
        }}
        onClose={() => setEmojiPickerVisible(false)}
      />
      {/* Above the thread and the chrome: an effect covers the screen. */}
      <ScreenEffectOverlay effect={screenEffect} onDone={() => setScreenEffect(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  threadArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.black,
  },
  messagesContainer: {
    backgroundColor: COLORS.black,
  },
  messagesContainerTransparent: {
    backgroundColor: 'transparent',
  },
  wallpaperLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  // Bubbles
  bubbleLeft: {
    backgroundColor: COLORS.gray[800],
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  bubbleRight: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  messageTextContainer: {
    marginVertical: 5,
    marginHorizontal: 10,
  },
  textLeft: {
    color: COLORS.white,
    fontSize: 13,
    lineHeight: 17,
  },
  textRight: {
    color: COLORS.black,
    fontSize: 13,
    lineHeight: 17,
  },
  timeLeft: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 9,
  },
  timeRight: {
    color: 'rgba(0,0,0,0.4)',
    fontSize: 9,
  },
  linkLeft: {
    color: '#7DB9FF',
    textDecorationLine: 'underline',
  },
  linkRight: {
    color: '#1B62D1',
    textDecorationLine: 'underline',
  },
  // Deleted message
  deletedBubble: {
    backgroundColor: 'transparent',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  deletedText: {
    color: COLORS.gray[500],
    fontStyle: 'italic',
    fontSize: 14,
    fontFamily: 'Archivo_400Regular',
  },
  // Edited label
  editedLabel: {
    fontSize: 10,
    color: COLORS.gray[500],
    fontFamily: 'Archivo_400Regular',
    marginTop: 2,
  },
  editedLeft: {
    paddingLeft: SPACING.md,
  },
  editedRight: {
    textAlign: 'right',
    paddingRight: SPACING.md,
  },
  // Input toolbar — ChatGPT-style capsule
  inputToolbarOuter: {
    backgroundColor: 'transparent',
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 2,
  },
  // Reply preview
  replyPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    // Lives INSIDE the capsule (Telegram): no box of its own, just the bar.
    backgroundColor: 'transparent',
    borderRadius: 0,
    marginBottom: 2,
    marginHorizontal: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  replyPreviewBar: {
    width: 3,
    height: '100%',
    // Black and white app: no blue accents in the reply preview.
    backgroundColor: COLORS.white,
    borderRadius: 2,
    marginRight: 10,
  },
  replyPreviewContent: {
    flex: 1,
  },
  replyPreviewName: {
    color: COLORS.white,
    fontSize: 13,
    fontFamily: 'Archivo_600SemiBold',
    marginBottom: 2,
  },
  replyPreviewText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontFamily: 'Archivo_400Regular',
  },
  replyPreviewClose: {
    padding: 4,
    marginLeft: 8,
  },
  editPreviewBarColor: {
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  editPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  editPreviewLabel: {
    color: COLORS.white,
    fontSize: 13,
    fontFamily: 'Archivo_600SemiBold',
  },
  // Reply quote inside bubble
  replyQuote: {
    flexDirection: 'row',
    marginHorizontal: 8,
    marginTop: 8,
    marginBottom: 4,
    padding: 10,
    borderRadius: 10,
    overflow: 'hidden',
    minWidth: 160,
  },
  replyQuoteOwn: {
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  replyQuoteOther: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  replyQuoteBar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: '#3B82F6',
    marginRight: 8,
  },
  replyQuoteContent: {
    flex: 1,
  },
  replyQuoteName: {
    color: '#3B82F6',
    fontSize: 12,
    fontFamily: 'Archivo_600SemiBold',
    marginBottom: 1,
  },
  replyQuoteText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontFamily: 'Archivo_400Regular',
  },
  // Emoji auxiliary preview (iOS context menu)
  emojiRow: {
    flexDirection: 'row',
    backgroundColor: '#2C2C2E',
    borderRadius: 22,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  emojiButton: {
    width: 40,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiText: {
    fontSize: 22,
  },
  // Ticks
  tickContainer: {
    flexDirection: 'row',
    marginRight: 4,
    marginBottom: 2,
  },
});
