// @ts-expect-error phoenix has no type declarations
import { Socket, Channel } from 'phoenix';
import { API_CONFIG } from '@/constants/config';
import { DeviceEventEmitter } from 'react-native';
import { authStorage } from '@/lib/auth/storage';

/** Emitted after the socket comes back; listeners refetch what they show. */
export const SOCKET_RECONNECTED_EVENT = 'attoSocketReconnected';

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
  onMessagePinned?: MessageHandler;
  onMessageUnpinned?: MessageHandler;
}

interface UserChannelHandlers {
  onConversationUpdated?: MessageHandler;
  /** The preview of a conversation changed with no new message (its last
   *  message was deleted): refresh the list, no banner and no badge. */
  onConversationPreviewChanged?: MessageHandler;
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
  // The token phoenix sends on EVERY (re)connect. phoenix reconnects on its
  // own after a drop and used to resend the token captured when the socket
  // was built: once it expired (15 min) every retry was refused with
  // :invalid_token and realtime stayed dead until the app was closed. The
  // client saw exactly that on Oct 3 2026 (five refusals in the chat-service
  // log at 17:05, the same seconds as his disconnects). Now params read this
  // field, and a drop refreshes it before phoenix retries.
  private latestToken: string | null = null;
  private refreshingToken: Promise<void> | null = null;
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

    this.latestToken = token;

    return new Promise<void>((resolve) => {
      const socket = new Socket(this.getSocketUrl(), {
        // A function: phoenix calls it on every connect attempt.
        params: () => ({ token: this.latestToken ?? token }),
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
        // Whatever arrived while the socket was down never came through it:
        // screens refetch on this (useRealtimeChat, useUserChannel).
        if (this.hasConnectedOnce) DeviceEventEmitter.emit(SOCKET_RECONNECTED_EVENT);
        this.hasConnectedOnce = true;
        this.onConnectionChange?.(true);
      });

      socket.onClose((event: { code?: number } | undefined) => {
        const replaced = this.socket !== socket;
        const exp = this.latestToken ? decodeJwtExp(this.latestToken) : null;
        const tokenExpired = exp !== null && exp * 1000 - Date.now() < 60_000;
        track('messages_websocket_disconnected', {
          replaced,
          close_code: event?.code ?? null,
          token_expired: tokenExpired,
        });
        this.onConnectionChange?.(false);
        // Make sure phoenix's next retry carries a valid token.
        if (!replaced && tokenExpired) void this.refreshLatestToken('close');
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
          return;
        }
        // A refused handshake reaches here as a bare error event, without
        // the reason. If our token is expired that is the reason.
        void this.refreshLatestToken('error');
      });

      socket.connect();
      this.scheduleProactiveRefresh(token);

      // Fallback: resolve after 3s so the app isn't blocked if the server is slow
      setTimeout(resolve, 3_000);
    });
  }

  /**
   * Refresh the token phoenix will send on its next retry, if it is expired
   * or about to. One refresh at a time; never tears the socket down.
   */
  private refreshLatestToken(source: 'close' | 'error' | 'resume'): Promise<void> {
    if (this.refreshingToken) return this.refreshingToken;
    const exp = this.latestToken ? decodeJwtExp(this.latestToken) : null;
    if (exp !== null && exp * 1000 - Date.now() > 60_000) return Promise.resolve();
    this.refreshingToken = ensureFreshToken()
      .then((fresh) => {
        if (fresh && fresh !== this.latestToken) {
          this.latestToken = fresh;
          this.scheduleProactiveRefresh(fresh);
          track('messages_websocket_token_refreshed', { source });
        }
      })
      .catch(() => {})
      .finally(() => {
        this.refreshingToken = null;
      });
    return this.refreshingToken;
  }

  /**
   * Coming back to the foreground: timers did not run in the background, so
   * the token may have expired while phoenix sat disconnected. Refresh it and,
   * if the socket is not up, reconnect now instead of waiting out the backoff.
   */
  async resume(): Promise<void> {
    if (!this.socket) return;
    await this.refreshLatestToken('resume');
    if (!this.socket.isConnected()) {
      track('messages_websocket_resume_reconnect', {});
      await this.refreshAndReconnect();
    }
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
      // A channel on this same socket is normally rejoined by phoenix, but
      // not one that ended closed or errored: after the chat-service restart
      // of Oct 3 2026 (17:17 UTC) the client's socket came back and the open
      // chat never rejoined, so two messages never showed until he relaunched.
      if (
        existing &&
        existing.socket === socket &&
        (existing.state === 'joined' || existing.state === 'joining')
      ) {
        return;
      }
      this.createChatChannel(socket, conversationId, handlers);
      rejoined += 1;
    });

    this.postChannelSpecs.forEach((handlers, postId) => {
      const topic = `post:${postId}`;
      const existing = this.channels.get(topic);
      if (
        existing &&
        existing.socket === socket &&
        (existing.state === 'joined' || existing.state === 'joining')
      ) {
        return;
      }
      this.createPostChannel(socket, postId, handlers);
      rejoined += 1;
    });

    if (this.userChannelSpec) {
      const existing = this.userChannel;
      const alive =
        existing &&
        existing.socket === socket &&
        (existing.state === 'joined' || existing.state === 'joining');
      if (!alive) {
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

  /**
   * Bind (or rebind) every chat event on a channel. Each event is cleared
   * first: joining the same conversation twice used to leave two live
   * bindings behind, and every incoming message was then handled twice.
   */
  private bindChatHandlers(channel: Channel, handlers: ChatChannelHandlers): void {
    const bindings: [string, MessageHandler | undefined][] = [
      ['new_message', handlers.onMessage],
      ['typing', handlers.onTyping],
      ['messages_read', handlers.onMessagesRead],
      ['message_history', handlers.onMessageHistory],
      ['reaction_added', handlers.onReactionAdded],
      ['reaction_removed', handlers.onReactionRemoved],
      ['message_edited', handlers.onMessageEdited],
      ['message_deleted', handlers.onMessageDeleted],
      ['message_pinned', handlers.onMessagePinned],
      ['message_unpinned', handlers.onMessageUnpinned],
    ];
    for (const [event, handler] of bindings) {
      channel.off(event);
      if (handler) channel.on(event, handler);
    }
  }

  private createChatChannel(
    socket: Socket,
    conversationId: string,
    handlers: ChatChannelHandlers
  ): Channel {
    // A channel left over from an older socket keeps receiving until it is
    // told to go, so it is retired before the new one is built.
    const stale = this.channels.get(conversationId);
    if (stale && stale.socket !== socket) {
      stale.leave();
      this.channels.delete(conversationId);
    }

    const channel = socket.channel(`chat:${conversationId}`, {});
    this.bindChatHandlers(channel, handlers);

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

    // Any live channel for this conversation on this socket is reused, in
    // whatever state it is: a second `socket.channel(...)` for the same
    // topic would receive every broadcast a second time. Joining while one
    // is still joining is the common case (a screen that remounts).
    const existing = this.channels.get(conversationId);
    if (existing && existing.socket === this.socket && existing.state !== 'closed') {
      this.bindChatHandlers(existing, handlers);
      if (existing.state !== 'joined' && existing.state !== 'joining') existing.join();
      return existing;
    }

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
    replyTo?: { id: string; content: string; sender: string },
    extra?: { metadata?: Record<string, unknown>; threadId?: string }
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const channel = this.channels.get(conversationId);
      if (!channel || !this.socket?.isConnected()) {
        // Fail fast so the caller falls back to REST right away instead of
        // waiting for a push timeout on a dead transport.
        reject(new Error(channel ? 'Socket not connected' : 'Channel not joined'));
        return;
      }

      const payload: Record<string, unknown> = { content, content_type: contentType };
      if (replyTo) {
        payload.reply_to_id = replyTo.id;
        payload.reply_to_content = replyTo.content;
        payload.reply_to_sender = replyTo.sender;
      }
      // Media details and iMessage style effects ride along as JSON.
      if (extra?.metadata) payload.metadata = extra.metadata;
      if (extra?.threadId) payload.thread_id = extra.threadId;

      channel
        .push('new_message', payload)
        .receive('ok', resolve)
        .receive('error', reject)
        .receive('timeout', () => reject(new Error('Timeout')));
    });
  }

  /**
   * Send a typing indicator. Slack shows it inside the thread rather than in
   * the channel, so a reply names the thread it is being written in; the main
   * chat sends none, which is what every older build sends.
   */
  sendTyping(conversationId: string, isTyping: boolean, threadId?: string | null): void {
    const channel = this.channels.get(conversationId);
    channel?.push('typing', {
      is_typing: isTyping,
      ...(threadId ? { thread_id: threadId } : null),
    });
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
      // This build knows the iMessage limits and explains a refusal.
      enforce_rules: true,
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
    if (handlers.onConversationPreviewChanged) {
      channel.on('conversation_preview_changed', handlers.onConversationPreviewChanged);
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
