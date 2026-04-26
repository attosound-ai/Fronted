/**
 * Type-safe catalogue of every custom analytics event in ATTO SOUND.
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
    TOKEN_REFRESH_FAILED: 'auth_token_refresh_failed',
    SESSION_RESTORED: 'auth_session_restored',
    SESSION_EXPIRED: 'auth_session_expired',
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

  // ── OTP (deep telemetry for debugging autofill) ─
  OTP: {
    // Screen lifecycle
    SCREEN_VIEWED: 'otp_screen_viewed',
    // Send/Resend
    SEND_REQUESTED: 'otp_send_requested',
    SEND_SUCCESS: 'otp_send_success',
    SEND_FAILED: 'otp_send_failed',
    RESEND_PRESSED: 'otp_resend_pressed',
    RESEND_SUCCESS: 'otp_resend_success',
    RESEND_FAILED: 'otp_resend_failed',
    // Input interactions
    INPUT_FOCUSED: 'otp_input_focused',
    INPUT_BLURRED: 'otp_input_blurred',
    INPUT_CHANGE: 'otp_input_change',
    KEY_PRESS: 'otp_key_press',
    // Autofill detection
    AUTOFILL_DETECTED: 'otp_autofill_detected',
    AUTOFILL_PARTIAL: 'otp_autofill_partial',
    PASTE_DETECTED: 'otp_paste_detected',
    // Completion
    COMPLETED: 'otp_completed',
    VERIFY_STARTED: 'otp_verify_started',
    VERIFY_SUCCESS: 'otp_verify_success',
    VERIFY_FAILED: 'otp_verify_failed',
    // Edit identifier
    EDIT_IDENTIFIER_OPENED: 'otp_edit_identifier_opened',
    EDIT_IDENTIFIER_SAVED: 'otp_edit_identifier_saved',
    // Timing
    TIME_TO_FILL: 'otp_time_to_fill',
    TIME_TO_VERIFY: 'otp_time_to_verify',
    DIGIT_TIMELINE: 'otp_digit_timeline',
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
    POST_CREATED: 'feed_post_created',
    POST_BOOKMARKED: 'feed_post_bookmarked',
    POST_REPOSTED: 'feed_post_reposted',
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
    OUTGOING_INITIATED: 'call_outgoing_initiated',
  },

  // ── Messages ───────────────────────────────────
  MESSAGES: {
    // Conversation lifecycle
    CONVERSATIONS_VIEWED: 'messages_conversations_viewed',
    CONVERSATION_OPENED: 'messages_conversation_opened',
    NEW_CONVERSATION_STARTED: 'messages_new_conversation_started',
    USER_SEARCHED: 'messages_user_searched',
    // Sending
    MESSAGE_SENT: 'messages_message_sent',
    MESSAGE_SEND_FAILED: 'messages_message_send_failed',
    MESSAGE_SEND_FALLBACK_REST: 'messages_message_send_fallback_rest',
    // Reply
    REPLY_SENT: 'messages_reply_sent',
    REPLY_STARTED: 'messages_reply_started',
    REPLY_CANCELLED: 'messages_reply_cancelled',
    // Edit
    EDIT_STARTED: 'messages_edit_started',
    EDIT_COMPLETED: 'messages_edit_completed',
    EDIT_CANCELLED: 'messages_edit_cancelled',
    EDIT_FAILED: 'messages_edit_failed',
    // Delete
    DELETE_CONFIRMED: 'messages_delete_confirmed',
    DELETE_FAILED: 'messages_delete_failed',
    // Reactions
    REACTION_ADDED: 'messages_reaction_added',
    REACTION_REMOVED: 'messages_reaction_removed',
    REACTION_FAILED: 'messages_reaction_failed',
    // Read receipts
    MESSAGES_MARKED_READ: 'messages_marked_read',
    // Real-time
    WEBSOCKET_CONNECTED: 'messages_websocket_connected',
    WEBSOCKET_DISCONNECTED: 'messages_websocket_disconnected',
    CHANNEL_JOINED: 'messages_channel_joined',
    CHANNEL_JOIN_FAILED: 'messages_channel_join_failed',
    MESSAGE_RECEIVED_REALTIME: 'messages_received_realtime',
    // Typing
    TYPING_STARTED: 'messages_typing_started',
    TYPING_STOPPED: 'messages_typing_stopped',
    // Pagination
    LOAD_EARLIER_PRESSED: 'messages_load_earlier',
    // Context menu
    CONTEXT_MENU_OPENED: 'messages_context_menu_opened',
    CONTEXT_MENU_ACTION: 'messages_context_menu_action',
    // Copy
    MESSAGE_COPIED: 'messages_message_copied',
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
    CREATOR_CONTACT_EDITED: 'profile_artist_contact_edited',
  },

  // ── Payments ───────────────────────────────────
  PAYMENT: {
    CHECKOUT_INITIATED: 'payment_checkout_initiated',
    PAYMENT_COMPLETED: 'payment_completed',
    PAYMENT_FAILED: 'payment_failed',
    SUBSCRIPTION_CANCELLED: 'payment_subscription_cancelled',
    BRIDGE_NUMBER_ASSIGNED: 'payment_bridge_number_assigned',
  },

  // ── Network ────────────────────────────────────
  NETWORK: {
    API_REQUEST: 'api_request',
  },

  // ── Errors ─────────────────────────────────────
  ERROR: {
    API_ERROR: 'error_api',
    UNHANDLED_EXCEPTION: 'error_unhandled_exception',
    NETWORK_ERROR: 'error_network',
  },

  // ── Social graph ───────────────────────────────
  SOCIAL: {
    FOLLOW: 'social_follow',
    UNFOLLOW: 'social_unfollow',
    FOLLOW_FAILED: 'social_follow_failed',
  },

  // ── Data integrity (invariant violations) ─────
  // Fired when a count would go below zero or otherwise break a basic
  // invariant. We never let it ship a bad number to the UI — we clamp —
  // but we capture the incident so we can find the upstream cause.
  INTEGRITY: {
    COUNT_INVARIANT_VIOLATED: 'integrity_count_invariant_violated',
  },
} as const;
