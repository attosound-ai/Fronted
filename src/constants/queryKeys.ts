/**
 * React Query Keys
 *
 * Claves centralizadas para React Query
 * Facilita invalidación y refetch de queries
 */

export const QUERY_KEYS = {
  // Auth
  AUTH: {
    USER: ['auth', 'user'] as const,
    SESSION: ['auth', 'session'] as const,
  },

  // Feed — INFINITE and REELS are scoped by userId so account switches
  // get a cache miss for the new user while preserving the old user's cache.
  FEED: {
    ALL: ['feed'] as const,
    INFINITE: (userId?: number) => ['feed', 'infinite', userId ?? 0] as const,
    REELS: (userId?: number) => ['feed', 'reels', userId ?? 0] as const,
    EXPLORE: ['feed', 'explore'] as const,
    POST: (id: string) => ['feed', 'post', id] as const,
    COMMENTS: (postId: string) => ['feed', 'comments', postId] as const,
    BOOKMARKS: ['feed', 'bookmarks'] as const,
    USER_POSTS: (userId: number) => ['feed', 'user-posts', userId] as const,
    SEARCH: (query: string) => ['feed', 'search', query] as const,
  },

  // Users
  USERS: {
    ALL: ['users'] as const,
    PROFILE: (id: number) => ['users', 'profile', id] as const,
    FOLLOWERS: (id: number) => ['users', 'followers', id] as const,
    FOLLOWING: (id: number) => ['users', 'following', id] as const,
    SEARCH: (query: string) => ['users', 'search', query] as const,
  },

  // Notifications
  NOTIFICATIONS: {
    ALL: ['notifications'] as const,
    UNREAD: ['notifications', 'unread'] as const,
  },

  // Verification
  VERIFICATION: {
    STATUS: ['verification', 'status'] as const,
  },

  // Messages
  MESSAGES: {
    CONVERSATIONS: ['messages', 'conversations'] as const,
    CHAT: (chatId: string) => ['messages', 'chat', chatId] as const,
  },

  // Payments
  PAYMENTS: {
    BRIDGE_NUMBER: ['payments', 'bridge-number'] as const,
  },
} as const;
