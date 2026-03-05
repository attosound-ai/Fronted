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

  // Feed
  FEED: {
    ALL: ['feed'] as const,
    INFINITE: ['feed', 'infinite'] as const,
    POST: (id: string) => ['feed', 'post', id] as const,
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
