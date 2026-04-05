/**
 * API Endpoints - Route paths relative to API_CONFIG.BASE_URL
 *
 * All routes go through Kong Gateway at a single base URL.
 * Paths are relative to the baseURL configured on the Axios instance.
 */

export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login',
    LOGIN_OTP: '/auth/login/otp',
    REGISTER: '/auth/register',
    PRE_REGISTER: '/auth/pre-register',
    COMPLETE_REGISTRATION: '/auth/complete-registration',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',
    FORGOT_PASSWORD: '/auth/forgot-password',
    RESET_PASSWORD: '/auth/reset-password',
    ME: '/auth/me',
    CHECK_PHONE: '/auth/check-phone',
    CHECK_USERNAME: '/auth/check-username',
    CHECK_EMAIL: '/auth/check-email',
    LOGIN_2FA: '/auth/login/2fa',
    ENABLE_2FA: '/auth/2fa/enable',
    CONFIRM_2FA: '/auth/2fa/confirm',
    DISABLE_2FA: '/auth/2fa/disable',
    SWITCH_ACCOUNT: '/auth/switch-account',
  },

  OTP: {
    SEND: '/otp/send',
    VERIFY: '/otp/verify',
  },

  USERS: {
    UPDATE_PROFILE: '/users/me/profile',
    PROFILE: (userId: number) => `/users/${userId}`,
    FOLLOWERS: (userId: number) => `/users/${userId}/followers`,
    FOLLOWING: (userId: number) => `/users/${userId}/following`,
    FOLLOW: (userId: number) => `/users/${userId}/follow`,
    STATS: (userId: number) => `/users/${userId}/stats`,
    SEARCH: '/users/search',
    DISCOVER: '/users/discover',
    VERIFICATION_SEND_OTP: '/users/me/verification/send-otp',
    VERIFICATION_VERIFY: '/users/me/verification/verify',
    LINKED_ACCOUNTS: '/users/me/linked-accounts',
    DELETE_ACCOUNT: '/users/me/account',
    PUSH_TOKEN: '/users/me/push-token',
  },

  POSTS: {
    FEED: '/posts/feed',
    REELS: '/posts/reels',
    REELS_VIEW: '/posts/reels/view',
    EXPLORE: '/posts/explore',
    SEARCH: '/content/search',
    CREATE: '/posts',
    DETAIL: (postId: string) => `/posts/${postId}`,
    UPDATE: (postId: string) => `/posts/${postId}`,
    LIKE: (postId: string) => `/posts/${postId}/like`,
    COMMENTS: (postId: string) => `/posts/${postId}/comments`,
    BOOKMARK: (postId: string) => `/posts/${postId}/bookmark`,
    REPOST: (postId: string) => `/posts/${postId}/repost`,
    SHARE: (postId: string) => `/posts/${postId}/share`,
    INTERACTORS: (postId: string, type: string) =>
      `/posts/${postId}/interactions/${type}`,
    BOOKMARKS_LIST: '/posts/bookmarks',
    USER_POSTS: (userId: number) => `/posts/user/${userId}`,
    DELETE: (postId: string) => `/content/${postId}`,
  },

  MESSAGES: {
    CONVERSATIONS: '/messages/conversations',
    CREATE_CONVERSATION: '/messages/conversations',
    CHAT: (chatId: string) => `/messages/${chatId}`,
    MARK_READ: (chatId: string) => `/messages/${chatId}/read`,
    SEND: '/messages',
  },

  NOTIFICATIONS: {
    LIST: '/notifications',
    MARK_READ: (id: string) => `/notifications/${id}/read`,
    MARK_READ_BY_ACTOR: '/notifications/read-by-actor',
    MARK_ALL_READ: '/notifications/read-all',
    UNREAD_COUNT: '/notifications/unread-count',
  },

  MEDIA: {
    SIGN: '/media/sign',
    UPLOAD: '/media/upload',
    DELETE: (mediaId: string) => `/media/${mediaId}`,
  },

  INMATES: {
    LOOKUP: '/users/inmates/lookup',
  },

  PAYMENTS: {
    TRANSACTIONS: '/payments/transactions',
    TRANSACTION: (id: string) => `/payments/transactions/${id}`,
    SUBSCRIPTIONS: '/payments/subscriptions',
    MY_SUBSCRIPTION: '/payments/subscriptions/me',
    CHECKOUT: '/payments/checkout',
    CONFIRM: '/payments/confirm',
    BRIDGE_NUMBER: '/payments/bridge-number',
    PLANS: '/payments/subscriptions/plans',
    ENTITLEMENTS: '/payments/subscriptions/me/entitlements',
    UPGRADE: '/payments/subscriptions/me/upgrade',
  },
  CREATOR_LOGOS: {
    LIST: '/creator-logos',
    VOTE: (id: string) => `/creator-logos/${id}/vote`,
    VOTERS: (id: string, type: string) => `/creator-logos/${id}/voters/${type}`,
  },
  TELEPHONY: {
    VOICE_TOKEN: '/telephony/tokens/voice',
    CALLS: '/telephony/calls',
    CALL: (callSid: string) => `/telephony/calls/${callSid}`,
    STREAM_START: (callSid: string) => `/telephony/calls/${callSid}/stream/start`,
    STREAM_STOP: (callSid: string) => `/telephony/calls/${callSid}/stream/stop`,
    SEGMENTS: (callSid: string) => `/telephony/calls/${callSid}/segments`,
  },
  PROJECTS: {
    LIST: '/telephony/projects',
    CREATE: '/telephony/projects',
    DETAIL: (id: string) => `/telephony/projects/${id}`,
    UPDATE: (id: string) => `/telephony/projects/${id}`,
    DELETE: (id: string) => `/telephony/projects/${id}`,
    ADD_SEGMENT: (id: string) => `/telephony/projects/${id}/segments`,
    REMOVE_SEGMENT: (id: string, segmentId: string) =>
      `/telephony/projects/${id}/segments/${segmentId}`,
    TIMELINE: (id: string) => `/telephony/projects/${id}/timeline`,
    EXPORT: (id: string) => `/telephony/projects/${id}/export`,
    WAVEFORM: (segmentId: string) => `/telephony/segments/${segmentId}/waveform`,
    UPLOAD_AUDIO: (id: string) => `/telephony/projects/${id}/upload-audio`,
  },
} as const;
