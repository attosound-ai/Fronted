/**
 * ChatScreen — main chat view powered by react-native-gifted-chat.
 *
 * Integrates: Phoenix WebSocket real-time, reactions, edit/delete,
 * audio/video players, optimistic sends, dark theme.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Alert,
  ImageBackground,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Text as RNText,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  GiftedChat,
  Bubble,
  InputToolbar,
  Composer,
  Send,
  Day,
  LinkParser,
} from 'react-native-gifted-chat';
import type {
  IMessage,
  BubbleProps,
  InputToolbarProps,
  ComposerProps,
  SendProps,
} from 'react-native-gifted-chat';
import { SendHorizontal, Check, CheckCheck, Clock, X, Pencil } from 'lucide-react-native';
import { PostHogMaskView } from 'posthog-react-native';
import { Platform } from 'react-native';

const ContextMenuView =
  Platform.OS === 'ios'
    ? require('react-native-ios-context-menu').ContextMenuView
    : ({ children }: { children: React.ReactNode }) => <>{children}</>;

import { QUERY_KEYS } from '@/constants/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { COLORS, SPACING } from '@/constants/theme';
import { Text } from '@/components/ui/Text';
import { showToast } from '@/components/ui/Toast';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { haptic } from '@/lib/haptics/hapticService';

import { useChat } from '../hooks/useChat';
import { useRealtimeChat } from '../hooks/useRealtimeChat';
import { useReactions } from '../hooks/useReactions';
import { useMessageActions } from '../hooks/useMessageActions';
import { useChatStore } from '../stores/chatStore';
import { messageService } from '../services/messageService';
import { notificationService } from '@/features/notifications/services/notificationService';
import { useNotificationStore } from '@/stores/notificationStore';
import { toGiftedMessages, type AttoMessage } from '../utils/messageAdapter';

import { ChatHeader } from './ChatHeader';
import { ReactionPicker } from './ReactionPicker';
import { TypingIndicator } from './TypingIndicator';
import { ReactionBar } from './ReactionBar';
import { useChatWallpapers } from '../hooks/useChatWallpapers';
import {
  CHAT_WALLPAPER_NONE_ID,
  useChatWallpaperStore,
} from '@/stores/chatWallpaperStore';
import * as Clipboard from 'expo-clipboard';
import { AudioMessagePlayer } from './AudioMessagePlayer';
import { VideoMessagePlayer } from './VideoMessagePlayer';

import type { ChatMessagesPage } from '../types';

// Text component used by LinkParser inside chat bubbles. Caps font scaling
// so iOS Larger Text / Android Display Size can't blow the bubble layout
// past what the bubble can fit. Defined at module scope so React doesn't
// remount the parsed text tree on every render.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CappedText(props: any) {
  return <RNText {...props} maxFontSizeMultiplier={1.0} />;
}

/** Typing indicator with bouncing dots */
function TypingFooter({ name }: { name: string }) {
  const { t } = useTranslation('messages');
  return (
    <View style={typingStyles.container}>
      <Text style={typingStyles.name}>{name}</Text>
      <Text style={typingStyles.label}>{t('typing.suffix')}</Text>
      <View style={typingStyles.dots}>
        {[0, 1, 2].map((i) => (
          <TypingDot key={i} delay={i * 150} />
        ))}
      </View>
    </View>
  );
}

function TypingDot({ delay }: { delay: number }) {
  const translateY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withDelay(
      delay,
      withRepeat(
        withSequence(withTiming(-6, { duration: 300 }), withTiming(0, { duration: 300 })),
        -1
      )
    );
  }, [delay, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={[typingStyles.dot, animatedStyle]} />;
}

const typingStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  name: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'Archivo_600SemiBold',
  },
  label: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'Archivo_400Regular',
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 2,
    marginTop: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#9CA3AF',
  },
});

interface ChatScreenProps {
  conversationId: string;
  participantName: string;
  participantId?: string;
  participantAvatar?: string | null;
  /** Rendered inline in iPad split-view (hides back button, skips router.back) */
  inline?: boolean;
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
  const [inputText, setInputText] = useState('');

  // Chat wallpaper — remote-managed, user picks from the settings gear
  // on the messages tab (ConversationsHeader).
  // `null` selectedWallpaperId means no explicit user choice yet, so we use
  // the first active wallpaper from the backend catalogue as global default.
  // `CHAT_WALLPAPER_NONE_ID` means user explicitly chose black/no wallpaper.
  const { data: wallpapersCatalogue = [] } = useChatWallpapers();
  const selectedWallpaperId = useChatWallpaperStore((s) => s.selectedWallpaperId);
  const activeWallpaper = useMemo(() => {
    if (selectedWallpaperId === CHAT_WALLPAPER_NONE_ID) {
      return null;
    }
    if (!selectedWallpaperId) {
      return wallpapersCatalogue[0] ?? null;
    }
    return wallpapersCatalogue.find((w) => w.id === selectedWallpaperId) ?? null;
  }, [selectedWallpaperId, wallpapersCatalogue]);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const sentMessageIds = useRef(new Set<string>()).current;
  const lastTapRef = useRef<Record<string, number>>({});

  // Typing state
  const typingUsers = useChatStore((s) => s.typingUsers[conversationId]);
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
  const giftedMessages = toGiftedMessages(
    messages,
    userId,
    participantName,
    participantAvatar
  );

  // ── Handlers ──

  const handleSend = useCallback(
    async (newMessages: IMessage[] = []) => {
      const content = (newMessages[0]?.text ?? '').trim();
      if (!content) return;

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
        setInputText('');
        return;
      }

      // Clear input and reply preview immediately
      setInputText('');
      const currentReply = replyMessage;
      setReplyMessage(null);

      // Optimistic insert
      const tempId = `temp-${Date.now()}`;
      sentMessageIds.add(tempId);
      const chatKey = QUERY_KEYS.MESSAGES.CHAT(conversationId);

      const replaceTempWith = (realId: string, status: 'sent' | 'failed') => {
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
          if (!old?.pages?.length) return old;
          return {
            ...old,
            pages: [
              {
                ...old.pages[0],
                messages: [
                  {
                    conversationId,
                    messageId: tempId,
                    senderId: userId,
                    content,
                    replyToId: currentReply?._id as string | undefined,
                    replyToContent: currentReply?.text,
                    replyToSender: currentReply?.user.name || undefined,
                    contentType: 'text',
                    isRead: false,
                    createdAt: new Date().toISOString(),
                    status: 'sending' as const,
                  },
                  ...old.pages[0].messages,
                ],
              },
              ...old.pages.slice(1),
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
        const serverMsg = await sendViaSocket(content, 'text', replyTo);
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
      queryClient,
      sentMessageIds,
      editingMessage,
      editMessage,
      replyMessage,
      t,
    ]
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
        case 'copy':
          Clipboard.setStringAsync(msg.text);
          showToast(t('actions.copied', { defaultValue: 'Copied' }));
          analytics.capture(ANALYTICS_EVENTS.MESSAGES.MESSAGE_COPIED, eventProps);
          break;
        case 'edit':
          setEditingMessage(msg);
          setInputText(msg.text);
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
    [conversationId, deleteMessage, t]
  );

  const handleBack = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MESSAGES.CONVERSATIONS() });
    if (!inline) router.back();
  }, [queryClient, inline]);

  // ── Custom renderers ──

  // gifted-chat v3 ignores `textProps` on Bubble (its internal MessageText
  // and Time don't forward the prop), so we render the text and timestamp
  // ourselves and apply `maxFontSizeMultiplier` directly. Without this the
  // bubble grows uncontrollably under iOS Larger Text / Android Display
  // Size accessibility settings.
  const renderMessageText = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (textProps: any) => {
      const position: 'left' | 'right' = textProps?.position ?? 'left';
      const text: string = textProps?.currentMessage?.text ?? '';
      const isRight = position === 'right';
      return (
        <View style={styles.messageTextContainer}>
          <LinkParser
            text={text}
            textStyle={isRight ? styles.textRight : styles.textLeft}
            linkStyle={isRight ? styles.linkRight : styles.linkLeft}
            TextComponent={CappedText}
          />
        </View>
      );
    },
    []
  );

  const renderTime = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (timeProps: any) => {
      const position: 'left' | 'right' = timeProps?.position ?? 'left';
      const createdAt = timeProps?.currentMessage?.createdAt;
      if (!createdAt) return null;
      const formatted = new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(createdAt));
      return (
        <RNText
          style={position === 'right' ? styles.timeRight : styles.timeLeft}
          maxFontSizeMultiplier={1.0}
        >
          {formatted}
        </RNText>
      );
    },
    []
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GiftedChat generic props are overly strict with extended IMessage types
  const renderBubble = useCallback(
    (props: BubbleProps<AttoMessage>) => {
      const msg = props.currentMessage;
      if (!msg) return null;

      if (msg.isDeleted) {
        return (
          <View style={styles.deletedBubble}>
            <Text style={styles.deletedText}>
              {t('chat.messageDeleted', { defaultValue: 'Message deleted' })}
            </Text>
          </View>
        );
      }

      const isOwn = msg.user._id === userId;

      const menuItems: Array<{
        actionKey: string;
        actionTitle: string;
        icon?: { type: string; imageValue: { systemName: string } };
        menuAttributes?: string[];
      }> = [
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
      ];
      if (isOwn) {
        menuItems.push({
          actionKey: 'edit',
          actionTitle: t('actions.edit', { defaultValue: 'Edit' }),
          icon: { type: 'IMAGE_SYSTEM', imageValue: { systemName: 'pencil' } },
        });
        menuItems.push({
          actionKey: 'delete',
          actionTitle: t('actions.delete', { defaultValue: 'Delete' }),
          icon: { type: 'IMAGE_SYSTEM', imageValue: { systemName: 'trash' } },
          menuAttributes: ['destructive'],
        });
      }

      return (
        <PostHogMaskView>
          <ContextMenuView
            menuConfig={{ menuTitle: '', menuItems }}
            shouldWaitForMenuToHide={false}
            onMenuWillShow={() => haptic('heavy')}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onPressMenuItem={({ nativeEvent }: any) =>
              handleMenuAction(nativeEvent.actionKey, msg)
            }
          >
            <View>
              <Bubble
                {...(props as any)}
                containerStyle={{
                  left: { marginLeft: 8 },
                  right: { marginRight: 8 },
                }}
                wrapperStyle={{
                  left: styles.bubbleLeft,
                  right: styles.bubbleRight,
                }}
                textStyle={{
                  left: styles.textLeft,
                  right: styles.textRight,
                }}
                timeTextStyle={{
                  left: styles.timeLeft,
                  right: styles.timeRight,
                }}
                renderMessageText={renderMessageText}
                renderTime={renderTime}
                isCustomViewBottom={false}
                renderCustomView={() => {
                  if (!msg.replyToId || !msg.replyToContent) return null;
                  return (
                    <View
                      style={[
                        styles.replyQuote,
                        isOwn ? styles.replyQuoteOwn : styles.replyQuoteOther,
                      ]}
                    >
                      <View style={styles.replyQuoteBar} />
                      <View style={styles.replyQuoteContent}>
                        <Text style={styles.replyQuoteName} numberOfLines={1}>
                          {msg.replyToSender || t('chat.you', { defaultValue: 'You' })}
                        </Text>
                        <Text
                          style={[
                            styles.replyQuoteText,
                            isOwn && { color: 'rgba(0,0,0,0.5)' },
                          ]}
                          numberOfLines={2}
                        >
                          {msg.replyToContent}
                        </Text>
                      </View>
                    </View>
                  );
                }}
                renderTicks={(message: AttoMessage) => {
                  if (message.user._id !== userId) return null;
                  return (
                    <View style={styles.tickContainer}>
                      {message.pending && (
                        <Clock size={12} color="rgba(0,0,0,0.4)" strokeWidth={2.25} />
                      )}
                      {message.sent && !message.received && !message.pending && (
                        <Check size={13} color="rgba(0,0,0,0.4)" strokeWidth={2.25} />
                      )}
                      {message.received && (
                        <CheckCheck size={13} color="#000" strokeWidth={2.25} />
                      )}
                    </View>
                  );
                }}
              />
              {msg.isEdited && (
                <Text
                  style={[
                    styles.editedLabel,
                    isOwn ? styles.editedRight : styles.editedLeft,
                  ]}
                >
                  {t('chat.edited', { defaultValue: 'edited' })}
                </Text>
              )}
              {msg.reactions && msg.reactions.length > 0 && (
                <ReactionBar
                  reactions={msg.reactions}
                  currentUserId={userId}
                  onToggle={(emoji) =>
                    toggleReaction(msg._id as string, emoji, msg.reactions)
                  }
                />
              )}
            </View>
          </ContextMenuView>
        </PostHogMaskView>
      );
    },
    [userId, toggleReaction, handleMenuAction, t, renderMessageText, renderTime]
  );

  const renderMessageAudio = useCallback((props: { currentMessage?: AttoMessage }) => {
    if (!props.currentMessage?.audio) return null;
    return <AudioMessagePlayer audioUrl={props.currentMessage.audio} />;
  }, []);

  const renderMessageVideo = useCallback((props: { currentMessage?: AttoMessage }) => {
    if (!props.currentMessage?.video) return null;
    return <VideoMessagePlayer videoUrl={props.currentMessage.video} />;
  }, []);

  const hasText = inputText.trim().length > 0;

  const renderInputToolbar = useCallback(
    (props: InputToolbarProps<AttoMessage>) => (
      <View
        style={[styles.inputToolbarOuter, { paddingBottom: Math.max(insets.bottom, 16) }]}
      >
        {editingMessage && (
          <View style={styles.replyPreview}>
            <View style={[styles.replyPreviewBar, styles.editPreviewBarColor]} />
            <View style={styles.replyPreviewContent}>
              <View style={styles.editPreviewHeader}>
                <Pencil size={13} color="#F59E0B" strokeWidth={2} />
                <Text style={styles.editPreviewLabel}>
                  {t('actions.editing', { defaultValue: 'Editing' })}
                </Text>
              </View>
              <Text style={styles.replyPreviewText} numberOfLines={1}>
                {editingMessage.text}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                setEditingMessage(null);
                setInputText('');
              }}
              style={styles.replyPreviewClose}
            >
              <X size={18} color="#888" strokeWidth={2} />
            </TouchableOpacity>
          </View>
        )}
        {replyMessage && !editingMessage && (
          <View style={styles.replyPreview}>
            <View style={styles.replyPreviewBar} />
            <View style={styles.replyPreviewContent}>
              <Text style={styles.replyPreviewName}>
                {replyMessage.user.name || 'You'}
              </Text>
              <Text style={styles.replyPreviewText} numberOfLines={1}>
                {replyMessage.text}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setReplyMessage(null)}
              style={styles.replyPreviewClose}
            >
              <X size={18} color="#888" strokeWidth={2} />
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.inputToolbarCapsule}>
          <PostHogMaskView style={styles.composerWrapper}>
            <Composer
              {...(props as any)}
              textInputStyle={styles.composerInput}
              placeholderTextColor="#8E8E93"
              placeholder={
                editingMessage
                  ? t('chat.editPlaceholder', { defaultValue: 'Edit message...' })
                  : t('chat.inputPlaceholder', { defaultValue: 'Message...' })
              }
              // Must merge — overwriting drops the onChangeText/ref that
              // GiftedChat injects, breaking controlled input (every
              // keystroke would re-render with the stale `text` prop and
              // erase what the user typed).
              textInputProps={{
                ...((props as any).textInputProps ?? {}),
                maxFontSizeMultiplier: 1.0,
              }}
            />
          </PostHogMaskView>
          <Send {...props} containerStyle={styles.sendContainer}>
            <View style={[styles.sendButton, !hasText && styles.sendButtonDisabled]}>
              <SendHorizontal
                size={16}
                color={hasText ? '#000' : '#888'}
                strokeWidth={2.5}
              />
            </View>
          </Send>
        </View>
      </View>
    ),
    [insets.bottom, editingMessage, replyMessage, hasText, t]
  );

  const renderComposer = useCallback(() => null, []);
  const renderSend = useCallback(() => null, []);

  // Cap date label scaling so "Today" / "FRI 8:10 PM" stay compact at AX5.
  const renderDay = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (dayProps: any) => <Day {...dayProps} textProps={{ maxFontSizeMultiplier: 1.0 }} />,
    []
  );

  if (!user) return null;

  // Render the wallpaper (if any) as an absolutely-positioned layer behind
  // GiftedChat, with a dark overlay on top so the bubbles remain legible.
  // The overlay colour + opacity come from the wallpaper document so admins
  // can tune contrast remotely without a rebuild.
  const wallpaperLayer = activeWallpaper ? (
    <View style={styles.wallpaperLayer} pointerEvents="none">
      <ImageBackground
        source={{ uri: activeWallpaper.imageUrl }}
        style={StyleSheet.absoluteFillObject}
        imageStyle={{
          backgroundColor: activeWallpaper.tintColor ?? '#000',
        }}
        resizeMode="repeat"
      >
        <View
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: `rgba(0,0,0,${activeWallpaper.overlayOpacity ?? 0.7})`,
            },
          ]}
        />
      </ImageBackground>
    </View>
  ) : null;

  return (
    <View style={styles.container}>
      {wallpaperLayer}

      <ChatHeader
        participantName={participantName}
        participantId={participantId || ''}
        onBack={handleBack}
        hideBack={inline}
      />

      <GiftedChat<AttoMessage>
        messages={giftedMessages}
        onSend={handleSend}
        user={{ _id: userId, name: user.username, avatar: user.avatar ?? undefined }}
        // Keyboard
        keyboardAvoidingViewProps={{ keyboardVerticalOffset: -(insets.bottom - 8) }}
        // Input — controlled mode for edit support
        text={inputText}
        isSendButtonAlwaysVisible
        minInputToolbarHeight={56}
        textInputProps={{
          placeholderTextColor: COLORS.gray[500],
          placeholder: editingMessage
            ? t('chat.editPlaceholder', { defaultValue: 'Edit message...' })
            : t('chat.inputPlaceholder', { defaultValue: 'Message...' }),
          onChangeText: (text: string) => {
            setInputText(text);
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
        }}
        // Appearance
        renderBubble={renderBubble}
        renderInputToolbar={renderInputToolbar}
        renderComposer={renderComposer}
        renderSend={renderSend}
        renderMessageAudio={renderMessageAudio}
        renderMessageVideo={renderMessageVideo}
        renderDay={renderDay}
        renderAvatar={null}
        // Interactions
        onPressMessage={(_context: unknown, message: IMessage) => {
          const msgId = String(message._id);
          const now = Date.now();
          const last = lastTapRef.current[msgId] ?? 0;
          lastTapRef.current[msgId] = now;
          if (now - last < 400) {
            haptic('medium');
            setSelectedMessage(message as AttoMessage);
            setEmojiPickerVisible(true);
          }
        }}
        isTyping={isParticipantTyping}
        renderFooter={() =>
          isParticipantTyping ? <TypingFooter name={participantName} /> : null
        }
        // Pagination
        loadEarlierMessagesProps={{
          isAvailable: hasMore,
          onPress: loadMore,
          isLoading: isFetchingMore,
        }}
        // Behavior
        isScrollToBottomEnabled
        scrollToBottomOffset={200}
        // Reply
        reply={{
          message: replyMessage
            ? {
                _id: replyMessage._id,
                text: replyMessage.text,
                user: replyMessage.user,
              }
            : null,
          onClear: () => setReplyMessage(null),
          swipe: {
            isEnabled: true,
            onSwipe: (msg) => setReplyMessage(msg as AttoMessage),
          },
        }}
        // Locale
        locale="en"
        // Style overrides — transparent over wallpaper so the pattern shows through.
        messagesContainerStyle={
          activeWallpaper ? styles.messagesContainerTransparent : styles.messagesContainer
        }
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
    </View>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: COLORS.black,
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 2,
  },
  inputToolbarCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 26,
    paddingLeft: 4,
    paddingRight: 8,
    paddingTop: 6,
    paddingBottom: 6,
    minHeight: 52,
    gap: 6,
  },
  composerWrapper: {
    flex: 1,
  },
  composerInput: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    borderWidth: 0,
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 6,
    maxHeight: 120,
    color: COLORS.white,
    fontFamily: 'Archivo_400Regular',
    fontSize: 13,
    lineHeight: 18,
    marginLeft: 0,
    marginRight: 0,
  },
  inputPrimary: {},
  // Send button — inside the capsule
  sendContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#444',
  },
  // Reply preview
  replyPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    marginBottom: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  replyPreviewBar: {
    width: 3,
    height: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 2,
    marginRight: 10,
  },
  replyPreviewContent: {
    flex: 1,
  },
  replyPreviewName: {
    color: '#3B82F6',
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
    backgroundColor: '#F59E0B',
  },
  editPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  editPreviewLabel: {
    color: '#F59E0B',
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
