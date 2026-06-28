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

  // ── Video (playback + load diagnostics) ───────
  // Full lifecycle so a slow/broken video is never silent:
  // LOAD_STARTED → LOAD_COMPLETED (carries load_ms) is the load-time funnel;
  // LOAD_ERROR (+ Sentry exception) and FALLBACK_USED capture breakage and the
  // HLS→MP4 recovery; PLAYBACK_TOGGLED records tap-to-pause/play; STALLED marks
  // mid-playback buffering. Every event carries `surface` (reels/feed/…)+`post_id`.
  VIDEO: {
    LOAD_STARTED: 'video_load_started',
    LOAD_COMPLETED: 'video_load_completed',
    LOAD_ERROR: 'video_load_error',
    FALLBACK_USED: 'video_fallback_used',
    PLAYBACK_TOGGLED: 'video_playback_toggled',
    STALLED: 'video_stalled',
  },

  // ── Calls ──────────────────────────────────────
  CALL: {
    // Fires at the very TOP of onCallInvite, before any auto-switch work, so
    // it timestamps the exact moment the VoIP invite reached JS. Compared
    // against the native push-arrival marker (UserDefaults `atto_last_voip_push_at`)
    // and the backend dial time, this is what reveals a cold-launch "rang
    // late / never rang" — the invite either arrives much later than the push
    // or never fires at all (app killed before the RN bridge booted).
    INCOMING_RAW: 'call_incoming_raw',
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
    TWILIO_UNREGISTERED: 'call_twilio_unregistered',
    INVITE_AUTO_SWITCH_STARTED: 'call_invite_auto_switch_started',
    INVITE_AUTO_SWITCH_SUCCEEDED: 'call_invite_auto_switch_succeeded',
    INVITE_AUTO_SWITCH_FAILED: 'call_invite_auto_switch_failed',
    INVITE_TARGET_NOT_LINKED: 'call_invite_target_not_linked',
    OUTGOING_INITIATED: 'call_outgoing_initiated',
    // Telemetry — deep diagnostics for WatchdogTermination repros (REACT-NATIVE-8).
    // TELEMETRY_TICK fires every 10 s while a call is active with a full
    // device snapshot (memory, battery, network, JS lag, listener counts).
    // TELEMETRY_MARKER fires on transition points (pre/post speaker toggle,
    // pre-disconnect, etc.) so post-mortem queries can pinpoint the leak.
    TELEMETRY_TICK: 'call_telemetry_tick',
    TELEMETRY_MARKER: 'call_telemetry_marker',
    // DTMF keypad — lets the user send touch-tones during a call (e.g. press
    // "1" to accept a Securus/prison-carrier inmate call after the IVR prompt).
    DTMF_SENT: 'call_dtmf_sent',
    DTMF_SEND_FAILED: 'call_dtmf_send_failed',
    KEYPAD_OPENED: 'call_keypad_opened',
    // FULL DTMF coverage so a failed "press 1 to accept Securus" leaves the
    // EXACT reason. DTMF_KEYPRESS fires on every physical key tap — INCLUDING
    // taps dropped because the keypad was disabled (not yet connected), the
    // single biggest blind spot. DTMF_ATTEMPT fires on every sendDigits call
    // with the full context (call_state, since_connected_ms, has_call_obj,
    // send_latency_ms, error) and an `outcome`: sent | no_active_call |
    // not_connected | invalid | busy | sdk_error — so no path is silent.
    // KEYPAD_AUTO_OPENED records the auto-present on an inbound (Securus) connect.
    DTMF_KEYPRESS: 'call_dtmf_keypress',
    DTMF_ATTEMPT: 'call_dtmf_attempt',
    KEYPAD_AUTO_OPENED: 'call_keypad_auto_opened',
    // Microphone permission. An incoming VoIP call answered from the lock
    // screen can connect with NO mic access (iOS only prompts lazily) — the
    // caller then can't hear the user. We now request at login; these events
    // let us measure grant state at login AND at the moment a call connects.
    MIC_PERMISSION_STATUS: 'call_mic_permission_status',
    MIC_PERMISSION_REQUESTED: 'call_mic_permission_requested',
    // /call screen hand-off. SCREEN_CONNECTED_NAV records the route + whether a
    // modal stack existed (cold-launch CallKit answers have none). BLACK_FALLBACK
    // fires only if the screen is still showing the black escape-hatch after the
    // hand-off should have happened — i.e. the user is stranded (Bug #2).
    SCREEN_CONNECTED_NAV: 'call_screen_connected_nav',
    SCREEN_BLACK_FALLBACK: 'call_screen_black_fallback',
  },

  // ── Messages ───────────────────────────────────
  MESSAGES: {
    // Conversation lifecycle
    CONVERSATIONS_VIEWED: 'messages_conversations_viewed',
    CONVERSATION_OPENED: 'messages_conversation_opened',
    NEW_CONVERSATION_STARTED: 'messages_new_conversation_started',
    CONVERSATION_RESOLVE_FAILED: 'messages_conversation_resolve_failed',
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
    APP_ICON_PICKER_OPENED: 'profile_app_icon_picker_opened',
    APP_ICON_CHANGED: 'profile_app_icon_changed',
    APP_ICON_CHANGE_FAILED: 'profile_app_icon_change_failed',
    SUPPORT_OPENED: 'profile_support_opened',
    SUPPORT_SUBMITTED: 'profile_support_submitted',
  },

  // ── Payments ───────────────────────────────────
  PAYMENT: {
    CHECKOUT_INITIATED: 'payment_checkout_initiated',
    PAYMENT_COMPLETED: 'payment_completed',
    PAYMENT_FAILED: 'payment_failed',
    SUBSCRIPTION_CANCELLED: 'payment_subscription_cancelled',
    BRIDGE_NUMBER_ASSIGNED: 'payment_bridge_number_assigned',
  },

  // ── Runtime / ambient ──────────────────────────
  // Tick fires every 30 s while the app is active (paused during calls —
  // CALL.TELEMETRY_TICK covers that window at 10 s) with the same flat
  // device snapshot as the call telemetry: memory, battery, network, JS lag,
  // listener counts. Always-on equivalent of CALL.TELEMETRY_TICK so the next
  // crash anywhere in the app (not just on a call) has runtime context.
  RUNTIME: {
    TELEMETRY_TICK: 'runtime_telemetry_tick',
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
