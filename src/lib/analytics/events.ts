/**
 * Type-safe catalogue of every custom analytics event in Atto Sound.
 * Namespaced by feature so funnels / insights in PostHog stay organised.
 */

export const ANALYTICS_EVENTS = {
  // ── Auth ───────────────────────────────────────
  AUTH: {
    LOGIN_OTP_SENT: 'auth_login_otp_sent',
    LOGIN_SUCCESS: 'auth_login_success',
    LOGIN_FAILED: 'auth_login_failed',
    LOGOUT: 'auth_logout',
    TOKEN_REFRESHED: 'auth_token_refreshed',
    SESSION_RESTORED: 'auth_session_restored',
  },

  // ── Registration (funnel) ──────────────────────
  REGISTRATION: {
    STARTED: 'registration_started',
    STEP_COMPLETED: 'registration_step_completed',
    OTP_SENT: 'registration_otp_sent',
    OTP_VERIFIED: 'registration_otp_verified',
    PROFILE_SETUP: 'registration_profile_setup',
    ROLE_SELECTED: 'registration_role_selected',
    CONSENT_GIVEN: 'registration_consent_given',
    SUBSCRIPTION_SELECTED: 'registration_subscription_selected',
    PAYMENT_COMPLETED: 'registration_payment_completed',
    COMPLETED: 'registration_completed',
    ABANDONED: 'registration_abandoned',
  },

  // ── Feed ───────────────────────────────────────
  FEED: {
    VIEWED: 'feed_viewed',
    REFRESHED: 'feed_refreshed',
    POST_LIKED: 'feed_post_liked',
    POST_UNLIKED: 'feed_post_unliked',
    POST_COMMENTED: 'feed_post_commented',
    POST_SHARED: 'feed_post_shared',
    POST_SUPPORT: 'feed_post_support_pressed',
    LOAD_MORE: 'feed_load_more',
    AUTHOR_PROFILE_PRESSED: 'feed_author_profile_pressed',
    FOLLOW_PRESSED: 'feed_follow_pressed',
  },

  // ── Calls ──────────────────────────────────────
  CALL: {
    INCOMING_RECEIVED: 'call_incoming_received',
    ACCEPTED: 'call_accepted',
    REJECTED: 'call_rejected',
    CONNECTED: 'call_connected',
    ENDED: 'call_ended',
    MUTE_TOGGLED: 'call_mute_toggled',
    SPEAKER_TOGGLED: 'call_speaker_toggled',
    HOLD_TOGGLED: 'call_hold_toggled',
    CAPTURE_STARTED: 'call_capture_started',
    CAPTURE_STOPPED: 'call_capture_stopped',
    TWILIO_REGISTERED: 'call_twilio_registered',
    TWILIO_REGISTRATION_FAILED: 'call_twilio_registration_failed',
  },

  // ── Messages ───────────────────────────────────
  MESSAGES: {
    CONVERSATIONS_VIEWED: 'messages_conversations_viewed',
    CONVERSATION_OPENED: 'messages_conversation_opened',
    MESSAGE_SENT: 'messages_message_sent',
    NEW_CONVERSATION_STARTED: 'messages_new_conversation_started',
    USER_SEARCHED: 'messages_user_searched',
  },

  // ── Projects ───────────────────────────────────
  PROJECT: {
    CREATED: 'project_created',
    OPENED: 'project_opened',
    DELETED: 'project_deleted',
    SEGMENT_ADDED: 'project_segment_added',
    SEGMENT_REMOVED: 'project_segment_removed',
    TIMELINE_SAVED: 'project_timeline_saved',
    EXPORTED: 'project_exported',
    PLAYBACK_STARTED: 'project_playback_started',
    CLIP_SPLIT: 'project_clip_split',
    CLIP_TRIMMED: 'project_clip_trimmed',
    CLIP_DELETED: 'project_clip_deleted',
  },

  // ── Profile ────────────────────────────────────
  PROFILE: {
    VIEWED: 'profile_viewed',
    EDIT_OPENED: 'profile_edit_opened',
    UPDATED: 'profile_updated',
    AVATAR_UPLOADED: 'profile_avatar_uploaded',
    VERIFICATION_OTP_SENT: 'profile_verification_otp_sent',
    VERIFICATION_COMPLETED: 'profile_verification_completed',
    ARTIST_CONTACT_EDITED: 'profile_artist_contact_edited',
  },

  // ── Payments ───────────────────────────────────
  PAYMENT: {
    CHECKOUT_INITIATED: 'payment_checkout_initiated',
    PAYMENT_COMPLETED: 'payment_completed',
    PAYMENT_FAILED: 'payment_failed',
    SUBSCRIPTION_CANCELLED: 'payment_subscription_cancelled',
    BRIDGE_NUMBER_ASSIGNED: 'payment_bridge_number_assigned',
  },

  // ── Errors ─────────────────────────────────────
  ERROR: {
    API_ERROR: 'error_api',
    UNHANDLED_EXCEPTION: 'error_unhandled_exception',
    NETWORK_ERROR: 'error_network',
  },
} as const;
