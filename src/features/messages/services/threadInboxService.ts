import { apiClient } from '@/lib/api/client';
import type { ApiSuccessResponse, BackendThreadSummary, InboxThread } from '../types';

/**
 * The threads inbox, served by chat-service. Slack keeps a "Threads" entry
 * above the channel list gathering every thread you started, replied to or
 * chose to follow. The unread count and the follow flag live on the server,
 * so they survive a reinstall and agree on the phone and the iPad.
 */
function map(row: BackendThreadSummary): InboxThread {
  return {
    threadId: row.thread_id,
    conversationId: row.conversation_id,
    participantId: row.participant_id ?? '',
    participantName: row.participant_name ?? '',
    rootPreview: row.root_preview ?? '',
    replyPreview: row.reply_preview ?? '',
    lastReplySenderId: row.last_reply_sender_id ?? '',
    replyCount: row.reply_count ?? 0,
    unread: Math.max(0, row.unread ?? 0),
    following: row.following !== false,
    lastReplyAt: row.last_reply_at ? Date.parse(row.last_reply_at) : 0,
  };
}

export const threadInboxService = {
  async list(): Promise<InboxThread[]> {
    const res =
      await apiClient.get<ApiSuccessResponse<{ threads: BackendThreadSummary[] }>>(
        '/messages/threads'
      );
    return (res.data.data?.threads ?? []).map(map);
  },

  /** Every reply in the thread counts as seen. Sent when the thread opens. */
  async markRead(conversationId: string, threadId: string): Promise<void> {
    await apiClient.post(`/messages/${conversationId}/threads/${threadId}/read`, {});
  },

  /** An unfollowed thread stays in the inbox but stops counting unread. */
  async setFollowing(
    conversationId: string,
    threadId: string,
    following: boolean
  ): Promise<void> {
    await apiClient.post(`/messages/${conversationId}/threads/${threadId}/follow`, {
      following,
    });
  },
};
