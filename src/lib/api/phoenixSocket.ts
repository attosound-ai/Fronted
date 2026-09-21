// @ts-expect-error phoenix has no type declarations
import { Socket, Channel } from 'phoenix';
import { API_CONFIG } from '@/constants/config';
import { authStorage } from '@/lib/auth/storage';

type MessageHandler = (payload: Record<string, unknown>) => void;

interface ChatChannelHandlers {
  onMessage?: MessageHandler;
  onTyping?: MessageHandler;
  onMessagesRead?: MessageHandler;
  onMessageHistory?: MessageHandler;
  onReactionAdded?: MessageHandler;
  onReactionRemoved?: MessageHandler;
  onMessageEdited?: MessageHandler;
  onMessageDeleted?: MessageHandler;
}

interface UserChannelHandlers {
  onConversationUpdated?: MessageHandler;
  onNewNotification?: MessageHandler;
}

interface PostChannelHandlers {
  onInteractionUpdate?: MessageHandler;
}

/**
 * Decode the `exp` (Unix seconds) claim from an HS256 JWT without verifying
 * the signature — the signature is irrelevant for "is this token close to
 * expiring?" and saves a native crypto roundtrip. Returns null for any
 * malformed input.
 */
function decodeJwtExp(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    // base64url → base64 → atob
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(
      typeof atob !== 'undefined'
        ? atob(padded)
        : Buffer.from(padded, 'base64').toString('utf8')
    );
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the access token to use for a (re)connect, refreshing it via the
 * existing auth store if it's expired or within the early-refresh window.
 *
 * Why this lives in the socket layer: the HTTP axios interceptor refreshes
 * on 401, but Phoenix Sockets never go through axios. Without this,
 * long-lived clients reconnect with a stale access token and chat-service
 * rejects every attempt with `:invalid_token` — exactly the symptom that
 * killed realtime messaging in production.
 */
async function ensureFreshToken(): Promise<string | null> {
  const token = await authStorage.getToken();
  if (!token) return null;

  const exp = decodeJwtExp(token);
  if (exp === null) return token; // unparseable — let the server decide

  // Refresh if the token is already expired or expires in < 60 s.
  const nowSec = Date.now() / 1000;
  const EARLY_REFRESH_SEC = 60;
  if (exp - nowSec > EARLY_REFRESH_SEC) return token;

  try {
    const { useAuthStore } = await import('@/stores/authStore');
    const newTokens = await useAuthStore.getState().refreshTokens();
    if (newTokens?.accessToken) return newTokens.accessToken;
  } catch {
    // refresh failed — fall through with the (likely-expired) token; the
    // server will reject and the upper layer can decide to log the user out.
  }
  return token;
}

function track(event: string, props: Record<string, unknown>): void {
  // Lazy import: the analytics module pulls stores that import this file.
  void import('@/lib/analytics')
    .then(({ analytics }) => analytics.capture(event, props))
    .catch(() => {});
}

/**
 * Singleton manager for the Phoenix WebSocket connection.
 * Handles connect/disconnect, channel join/leave, and auto-reconnect.
 *
 * Channel registry: every channel the app asks for (chat, user, post) is
 * remembered with its handlers, independently of the Socket object that
 * currently carries it. When the socket is REPLACED (token refresh, auth
 * error) the old Channel objects die with it; a fresh socket re-creates every
 * registered channel on open. Before this, an open ChatScreen silently lost
 * realtime after a token refresh: `pushMessage` kept using a channel bound to
 * the dead socket (timeouts → REST fallback) and incoming messages never
 * arrived until the screen remounted (`messages_channel_join_failed`).
 */
class PhoenixSocketManager {
  private socket: Socket | null = null;
  private connectPromise: Promise<void> | null = null;
  private readonly channels = new Map<string, Channel>();
  private readonly chatChannelSpecs = new Map<string, ChatChannelHandlers>();
  private readonly postChannelSpecs = new Map<string, PostChannelHandlers>();
  private userChannel: Channel | null = null;
  private userChannelSpec: { userId: string; handlers: UserChannelHandlers } | null =
    null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private hasConnectedOnce = false;
  onConnectionChange?: (connected: boolean) => void;

  /** Build the WebSocket URL from the REST API base URL. */
  private getSocketUrl(): string {
    const base = API_CONFIG.BASE_URL.replace(/\/api\/v1\/?$/, '');
    const wsBase = base.replace(/^http/, 'ws');
    return `${wsBase}/socket`;
  }

  /** Connect to the Phoenix WebSocket server. Resolves once the socket is open.
   *
   *  Auth: chat-service's UserSocket verifies an HS256 JWT and derives the
   *  user_id from the verified `sub` claim — it does NOT read a user id from
   *  the params. So we must pass the access token (JWT), never the user id.
   *  (A previous version sent the user id as `token`, which chat-service
   *  rejected as `:invalid_token`, killing realtime delivery entirely.)
   */
  connect(): Promise<void> {
    if (this.socket?.isConnected()) return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = this.openSocket().finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  private async openSocket(): Promise<void> {
    const token = await ensureFreshToken();
    if (!token) return;

    return new Promise<void>((resolve) => {
      const socket = new Socket(this.getSocketUrl(), {
        params: { token },
        reconnectAfterMs: (tries: number) => Math.min(1000 * 2 ** tries, 30_000),
        heartbeatIntervalMs: 30_000,
      });
      this.socket = socket;

      socket.onOpen(() => {
        resolve();
        const rejoined = this.rejoinRegisteredChannels(socket);
        track('messages_websocket_connected', {
          reconnect: this.hasConnectedOnce,
          channels_rejoined: rejoined,
        });
        this.hasConnectedOnce = true;
        this.onConnectionChange?.(true);
      });

      socket.onClose(() => {
        track('messages_websocket_disconnected', { replaced: this.socket !== socket });
        this.onConnectionChange?.(false);
      });

      // Auth-style errors (`:invalid_token` from chat-service) come through
      // here. Refresh the token + force a clean reconnect so the next
      // attempt uses a valid JWT — otherwise phoenix would back-off-retry
      // with the stale token forever. Non-auth socket errors fall through
      // to phoenix's built-in reconnect logic.
      socket.onError((err: unknown) => {
        const msg =
          typeof err === 'string' ? err : (err as { message?: string })?.message;
        if (msg && /invalid_token|unauthor/i.test(msg)) {
          void this.refreshAndReconnect();
        }
      });

      socket.connect();
      this.scheduleProactiveRefresh(token);

      // Fallback: resolve after 3s so the app isn't blocked if the server is slow
      setTimeout(resolve, 3_000);
    });
  }

  /**
   * Re-create every registered channel on `socket`. Channels that already
   * live on this very socket are left alone: phoenix rejoins those itself
   * after its own transport level reconnects.
   */
  private rejoinRegisteredChannels(socket: Socket): number {
    if (this.socket !== socket) return 0;
    let rejoined = 0;

    this.chatChannelSpecs.forEach((handlers, conversationId) => {
      const existing = this.channels.get(conversationId);
      if (existing && existing.socket === socket) return;
      this.createChatChannel(socket, conversationId, handlers);
      rejoined += 1;
    });

    this.postChannelSpecs.forEach((handlers, postId) => {
      const topic = `post:${postId}`;
      const existing = this.channels.get(topic);
      if (existing && existing.socket === socket) return;
      this.createPostChannel(socket, postId, handlers);
      rejoined += 1;
    });

    if (this.userChannelSpec) {
      const existing = this.userChannel;
      if (!existing || existing.socket !== socket) {
        this.createUserChannel(
          socket,
          this.userChannelSpec.userId,
          this.userChannelSpec.handlers
        );
        rejoined += 1;
      }
    }

    return rejoined;
  }

  /**
   * Schedule a force-reconnect ~60 s before the current token's `exp` so
   * the socket always rides on a fresh JWT. The reconnect itself goes
   * through `connect()` which calls `ensureFreshToken()`.
   */
  private scheduleProactiveRefresh(token: string): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    const exp = decodeJwtExp(token);
    if (exp === null) return;
    const msUntilRefresh = Math.max(
      0,
      exp * 1000 - Date.now() - 60_000 // refresh 60s before expiry
    );
    this.refreshTimer = setTimeout(() => {
      void this.refreshAndReconnect();
    }, msUntilRefresh);
  }

  /**
   * Tear down the current socket and reconnect — `connect()` will refresh
   * the access token first. Registered channels are re-created on the new
   * socket from `rejoinRegisteredChannels`.
   */
  private async refreshAndReconnect(): Promise<void> {
    if (this.connectPromise) {
      await this.connectPromise;
      return;
    }
    const old = this.socket;
    this.socket = null;
    old?.disconnect();
    await this.connect();
  }

  /** Disconnect and clean up all channels. */
  disconnect(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.leaveUserChannel();
    this.channels.forEach((ch) => ch.leave());
    this.channels.clear();
    this.chatChannelSpecs.clear();
    this.postChannelSpecs.clear();
    const socket = this.socket;
    this.socket = null;
    socket?.disconnect();
  }

  private createChatChannel(
    socket: Socket,
    conversationId: string,
    handlers: ChatChannelHandlers
  ): Channel {
    const channel = socket.channel(`chat:${conversationId}`, {});

    if (handlers.onMessage) channel.on('new_message', handlers.onMessage);
    if (handlers.onTyping) channel.on('typing', handlers.onTyping);
    if (handlers.onMessagesRead) channel.on('messages_read', handlers.onMessagesRead);
    if (handlers.onMessageHistory)
      channel.on('message_history', handlers.onMessageHistory);
    if (handlers.onReactionAdded) channel.on('reaction_added', handlers.onReactionAdded);
    if (handlers.onReactionRemoved)
      channel.on('reaction_removed', handlers.onReactionRemoved);
    if (handlers.onMessageEdited) channel.on('message_edited', handlers.onMessageEdited);
    if (handlers.onMessageDeleted)
      channel.on('message_deleted', handlers.onMessageDeleted);

    channel
      .join()
      .receive('ok', () => {
        this.channels.set(conversationId, channel);
      })
      .receive('error', (resp: unknown) => {
        console.warn('[PhoenixSocket] Failed to join channel:', resp);
      });

    this.channels.set(conversationId, channel);
    return channel;
  }

  /**
   * Join a chat channel for a conversation. The subscription is remembered:
   * if the socket is not up yet (or gets replaced later) the channel is
   * created as soon as a socket opens. Returns null while there is no socket.
   */
  joinChannel(
    conversationId: string,
    handlers: ChatChannelHandlers = {}
  ): Channel | null {
    this.chatChannelSpecs.set(conversationId, handlers);
    if (!this.socket) return null;

    const existing = this.channels.get(conversationId);
    if (existing?.state === 'joined' && existing.socket === this.socket) return existing;

    return this.createChatChannel(this.socket, conversationId, handlers);
  }

  /** Leave a chat channel and forget its subscription. */
  leaveChannel(conversationId: string): void {
    this.chatChannelSpecs.delete(conversationId);
    const channel = this.channels.get(conversationId);
    if (channel) {
      channel.leave();
      this.channels.delete(conversationId);
    }
  }

  /** Push a message to a channel. Returns a promise that resolves with the server reply. */
  pushMessage(
    conversationId: string,
    content: string,
    contentType = 'text',
    replyTo?: { id: string; content: string; sender: string }
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const channel = this.channels.get(conversationId);
      if (!channel || !this.socket?.isConnected()) {
        // Fail fast so the caller falls back to REST right away instead of
        // waiting for a push timeout on a dead transport.
        reject(new Error(channel ? 'Socket not connected' : 'Channel not joined'));
        return;
      }

      const payload: Record<string, string> = { content, content_type: contentType };
      if (replyTo) {
        payload.reply_to_id = replyTo.id;
        payload.reply_to_content = replyTo.content;
        payload.reply_to_sender = replyTo.sender;
      }

      channel
        .push('new_message', payload)
        .receive('ok', resolve)
        .receive('error', reject)
        .receive('timeout', () => reject(new Error('Timeout')));
    });
  }

  /** Send a typing indicator. */
  sendTyping(conversationId: string, isTyping: boolean): void {
    const channel = this.channels.get(conversationId);
    channel?.push('typing', { is_typing: isTyping });
  }

  /** Add an emoji reaction to a message. */
  addReaction(conversationId: string, messageId: string, emoji: string): Promise<void> {
    return this.pushToChannel(conversationId, 'add_reaction', {
      message_id: messageId,
      emoji,
    });
  }

  /** Remove an emoji reaction from a message. */
  removeReaction(
    conversationId: string,
    messageId: string,
    emoji: string
  ): Promise<void> {
    return this.pushToChannel(conversationId, 'remove_reaction', {
      message_id: messageId,
      emoji,
    });
  }

  /** Edit a message's content. */
  editMessage(conversationId: string, messageId: string, content: string): Promise<void> {
    return this.pushToChannel(conversationId, 'edit_message', {
      message_id: messageId,
      content,
    });
  }

  /** Soft-delete a message. */
  deleteMessage(conversationId: string, messageId: string): Promise<void> {
    return this.pushToChannel(conversationId, 'delete_message', {
      message_id: messageId,
    });
  }

  /** Generic push helper that returns a promise. */
  private pushToChannel(
    conversationId: string,
    event: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const channel = this.channels.get(conversationId);
      if (!channel || !this.socket?.isConnected()) {
        reject(new Error(channel ? 'Socket not connected' : 'Channel not joined'));
        return;
      }
      channel
        .push(event, payload)
        .receive('ok', () => resolve())
        .receive('error', reject)
        .receive('timeout', () => reject(new Error('Timeout')));
    });
  }

  /** Mark all messages as read in a conversation.
   *  Retries for up to 3s if the channel hasn't joined yet. */
  markRead(conversationId: string): void {
    const tryPush = (attempts: number) => {
      const channel = this.channels.get(conversationId);
      if (channel?.state === 'joined') {
        channel.push('mark_read', {});
        return;
      }
      if (attempts > 0) {
        setTimeout(() => tryPush(attempts - 1), 500);
      }
    };
    tryPush(6); // 6 attempts × 500ms = 3s max wait
  }

  private createUserChannel(
    socket: Socket,
    userId: string,
    handlers: UserChannelHandlers
  ): Channel {
    const channel = socket.channel(`user:${userId}`, {});

    if (handlers.onConversationUpdated) {
      channel.on('conversation_updated', handlers.onConversationUpdated);
    }
    if (handlers.onNewNotification) {
      channel.on('new_notification', handlers.onNewNotification);
    }

    channel
      .join()
      .receive('ok', () => {
        this.userChannel = channel;
      })
      .receive('error', (resp: unknown) => {
        console.warn('[PhoenixSocket] Failed to join user channel:', resp);
      });

    this.userChannel = channel;
    return channel;
  }

  /** Join the user-level channel for conversation list updates. */
  joinUserChannel(userId: string, handlers: UserChannelHandlers = {}): Channel | null {
    this.userChannelSpec = { userId, handlers };
    if (!this.socket) return null;
    if (this.userChannel?.state === 'joined' && this.userChannel.socket === this.socket) {
      return this.userChannel;
    }
    return this.createUserChannel(this.socket, userId, handlers);
  }

  /** Leave the user-level channel. */
  leaveUserChannel(): void {
    this.userChannelSpec = null;
    if (this.userChannel) {
      this.userChannel.leave();
      this.userChannel = null;
    }
  }

  private createPostChannel(
    socket: Socket,
    postId: string,
    handlers: PostChannelHandlers
  ): Channel {
    const topic = `post:${postId}`;
    const channel = socket.channel(topic, {});

    if (handlers.onInteractionUpdate) {
      channel.on('interaction_update', handlers.onInteractionUpdate);
    }

    channel
      .join()
      .receive('ok', () => {
        this.channels.set(topic, channel);
      })
      .receive('error', (resp: unknown) => {
        console.warn('[PhoenixSocket] Failed to join post channel:', resp);
      });

    this.channels.set(topic, channel);
    return channel;
  }

  /** Join a post channel for real-time interaction updates. */
  joinPostChannel(postId: string, handlers: PostChannelHandlers = {}): Channel | null {
    this.postChannelSpecs.set(postId, handlers);
    if (!this.socket) return null;

    const topic = `post:${postId}`;
    const existing = this.channels.get(topic);
    if (existing?.state === 'joined' && existing.socket === this.socket) return existing;

    return this.createPostChannel(this.socket, postId, handlers);
  }

  /** Leave a post channel. */
  leavePostChannel(postId: string): void {
    this.postChannelSpecs.delete(postId);
    this.leaveChannel(`post:${postId}`);
  }

  /** Check if the socket is connected. */
  isConnected(): boolean {
    return this.socket?.isConnected() ?? false;
  }
}

export const phoenixSocket = new PhoenixSocketManager();
