// @ts-expect-error phoenix has no type declarations
import { Socket, Channel } from 'phoenix';
import { API_CONFIG } from '@/constants/config';
import { authStorage } from '@/lib/auth/storage';

type MessageHandler = (payload: Record<string, unknown>) => void;

/**
 * Singleton manager for the Phoenix WebSocket connection.
 * Handles connect/disconnect, channel join/leave, and auto-reconnect.
 */
class PhoenixSocketManager {
  private socket: Socket | null = null;
  private readonly channels = new Map<string, Channel>();
  private userChannel: Channel | null = null;

  /** Build the WebSocket URL from the REST API base URL. */
  private getSocketUrl(): string {
    const base = API_CONFIG.BASE_URL.replace(/\/api\/v1\/?$/, '');
    const wsBase = base.replace(/^http/, 'ws');
    return `${wsBase}/socket`;
  }

  /** Connect to the Phoenix WebSocket server. Resolves once the socket is open. */
  async connect(): Promise<void> {
    if (this.socket?.isConnected()) return;

    const token = await authStorage.getToken();
    if (!token) return;

    // Lazy-import to avoid circular deps at module-load time
    const { useAuthStore } = await import('@/stores/authStore');
    const user = useAuthStore.getState().user;
    const userId = user ? String(user.id) : undefined;

    return new Promise<void>((resolve) => {
      this.socket = new Socket(this.getSocketUrl(), {
        params: { token: userId || token },
        reconnectAfterMs: (tries: number) => Math.min(1000 * 2 ** tries, 30_000),
        heartbeatIntervalMs: 30_000,
      });

      this.socket.onOpen(() => resolve());
      this.socket.connect();

      // Fallback: resolve after 10s so the app isn't blocked if the server is slow
      setTimeout(resolve, 10_000);
    });
  }

  /** Disconnect and clean up all channels. */
  disconnect(): void {
    this.leaveUserChannel();
    this.channels.forEach((ch) => ch.leave());
    this.channels.clear();
    this.socket?.disconnect();
    this.socket = null;
  }

  /** Join a chat channel for a conversation. */
  joinChannel(
    conversationId: string,
    handlers: {
      onMessage?: MessageHandler;
      onTyping?: MessageHandler;
      onMessagesRead?: MessageHandler;
      onMessageHistory?: MessageHandler;
    } = {}
  ): Channel | null {
    if (!this.socket) return null;

    const existing = this.channels.get(conversationId);
    if (existing?.state === 'joined') return existing;

    const channel = this.socket.channel(`chat:${conversationId}`, {});

    if (handlers.onMessage) channel.on('new_message', handlers.onMessage);
    if (handlers.onTyping) channel.on('typing', handlers.onTyping);
    if (handlers.onMessagesRead) channel.on('messages_read', handlers.onMessagesRead);
    if (handlers.onMessageHistory)
      channel.on('message_history', handlers.onMessageHistory);

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

  /** Leave a chat channel. */
  leaveChannel(conversationId: string): void {
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
    contentType = 'text'
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const channel = this.channels.get(conversationId);
      if (!channel) {
        reject(new Error('Channel not joined'));
        return;
      }

      channel
        .push('new_message', { content, content_type: contentType })
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

  /** Mark all messages as read in a conversation. */
  markRead(conversationId: string): void {
    const channel = this.channels.get(conversationId);
    channel?.push('mark_read', {});
  }

  /** Join the user-level channel for conversation list updates. */
  joinUserChannel(
    userId: string,
    handlers: { onConversationUpdated?: MessageHandler } = {}
  ): Channel | null {
    if (!this.socket) return null;
    if (this.userChannel?.state === 'joined') return this.userChannel;

    const channel = this.socket.channel(`user:${userId}`, {});

    if (handlers.onConversationUpdated) {
      channel.on('conversation_updated', handlers.onConversationUpdated);
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

  /** Leave the user-level channel. */
  leaveUserChannel(): void {
    if (this.userChannel) {
      this.userChannel.leave();
      this.userChannel = null;
    }
  }

  /** Check if the socket is connected. */
  isConnected(): boolean {
    return this.socket?.isConnected() ?? false;
  }
}

export const phoenixSocket = new PhoenixSocketManager();
