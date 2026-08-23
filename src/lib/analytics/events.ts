/**
 * Type-safe catalogue of every custom analytics event in ATTO SOUND.
 * Namespaced by feature so funnels / insights in PostHog stay organised.
 *
 * READ THIS BEFORE TRUSTING A NAME (Aug 23 2026). Presence in this file means
 * the name is RESERVED, not that anything emits it. `POST_COMMENTED` sat here
 * for months while commenting produced no data whatsoever, so "do we have an
 * event for that?" answered yes when the truth was no — and a real bug (a
 * comment badge stuck at 1 against a list of 2) had to be diagnosed from psql
 * and redis-cli instead. A count on the day of writing: 217 names defined, 8
 * emitted as raw string literals rather than through these constants, and 57
 * with no reference anywhere in the app.
 *
 * To check a specific one before relying on it:
 *   grep -rn "ANALYTICS_EVENTS.<NS>.<KEY>\|'<event_name>'" src/
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
    // A password field received invisible whitespace/zero-width chars (iOS
    // QuickType trailing space) that we stripped — confirms the "passwords look
    // identical but don't match" bug in the field. `screen` says where.
    PASSWORD_INVISIBLE_CHARS_STRIPPED: 'auth_password_invisible_chars_stripped',
    // ── Identity coherence (Aug 1 2026 incident) ──
    // The UI's idea of "who am I" and the JWT actually attached to requests
    // diverged (or nearly did). DETECTED fires at the observation point,
    // HEALED after the session was rebuilt around the server's answer.
    IDENTITY_DESYNC_DETECTED: 'auth_identity_desync_detected',
    IDENTITY_DESYNC_HEALED: 'auth_identity_desync_healed',
    // A token refresh finished after the session changed hands (switch or
    // logout mid-flight); its tokens were discarded instead of persisted.
    REFRESH_DISCARDED_STALE: 'auth_refresh_discarded_stale',
    // Session restore could not validate against the backend (timeout/5xx)
    // and kept the cached session instead of logging the user out.
    SESSION_RESTORE_DEFERRED: 'auth_session_restore_deferred',
    // Cold start found a stored user but no tokens — a keychain read
    // failure, not a normal logged-out boot.
    SESSION_MISSING_TOKENS: 'auth_session_missing_tokens',
    // loadAccounts removed stored account entries the server says are not
    // linked to the authenticated user. Should be rare; a spike means the
    // purge anchor is wrong again.
    ACCOUNT_GHOST_PURGED: 'auth_account_ghost_purged',
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
    // RESERVED, NEVER EMITTED. Commenting is covered by SOCIAL.ACTION with
    // action='comment_create' | 'comment_edit' | 'comment_delete', which also
    // carries the outcome. Do not wire this one up without deciding what it
    // adds over that; it exists only so the old name is not silently reused.
    POST_COMMENTED: 'feed_post_commented',
    POST_SHARED: 'feed_post_shared',
    POST_SUPPORT: 'feed_post_support_pressed',
    POST_CREATED: 'feed_post_created',
    // Success/failure pairs so "parece que guardó pero no" is never invisible
    // again (the edit-post bug was silent for weeks): every post mutation
    // reports its outcome.
    POST_CREATE_FAILED: 'feed_post_create_failed',
    POST_EDIT_FAILED: 'feed_post_edit_failed',
    // Edit succeeded — the DISCRIMINATOR for "Done doesn't update the post until I
    // re-edit" (David, Jul 26, ATTO acct). Compares what we SUBMITTED vs what the
    // backend RETURNED on the PUT: returned_matches_submitted=false means the
    // backend didn't persist/return the new text (backend bug); true means it did
    // and any staleness is client cache (fixed by writing this response directly).
    // had_single_post_cache tells us the viewer was reading the FEED.POST cache.
    POST_EDITED: 'feed_post_edited',
    POST_DELETED: 'feed_post_deleted',
    POST_DELETE_FAILED: 'feed_post_delete_failed',
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
    // WHERE an in-call recording asked to be placed on the timeline. Recordings
    // used to be appended after the last clip on the lane, so a take sung over an
    // imported track landed detached at the end and the timeline read as wrong
    // (David, Aug 2). We had NO data on placement at all; this makes requested
    // position vs playhead vs lane queryable, and proves the backend honoured it.
    RECORDING_PLACED: 'call_recording_placed',
    // Mic-recorder attempts (build 156). This path was 100% telemetry-silent:
    // the client's empty mid-call take on Aug 20 left no row at all. outcome =
    // started | blocked_busy | blocked_active_call | permission_denied | error;
    // blocked_active_call means a surface tried plain mic recording during a
    // live call (it must use recordingMode="twilioCall" instead).
    MIC_RECORD_ATTEMPT: 'call_mic_record_attempt',
    TWILIO_REGISTERED: 'call_twilio_registered',
    TWILIO_REGISTRATION_FAILED: 'call_twilio_registration_failed',
    // Outcome of the native PushKit->CallKit report (AppDelegate writes it to
    // NSUserDefaults; JS reads it via Settings on foreground). outcome: reported |
    // gave_up, with the attempt count (×0.5s ≈ latency to report). This proves
    // whether the extended ~12s window is enough on cold launch or a native
    // CallKit report (independent of RN boot) is still required.
    VOIP_PUSH_OUTCOME: 'call_voip_push_outcome',
    // A call was in progress and the app DIED without ever reporting a terminal
    // state (no Disconnected event, no clean end) — i.e. a silent jetsam/watchdog
    // kill. Detected on the next launch from an MMKV marker written at call start
    // and cleared on a clean end. Closes the blind spot where only 8 of 20 answered
    // calls had a disconnect reason and every silent death had to be INFERRED from
    // missing events. Carries how long the call had run and its last known state.
    DIED_UNREPORTED: 'call_died_unreported',
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
    // Lightweight 2 s memory heartbeat during a call — memUsedMB + jsLag + the
    // last operation marker. The 10 s full tick was too coarse to catch the
    // in-call Record Pro editor exploding memory 200MB->1.4GB in seconds before
    // the OOM/watchdog kill (David, Jul 22); this samples the ramp finely and
    // ties each sample to what the app was doing (last_marker).
    MEM_HEARTBEAT: 'call_mem_heartbeat',
    // Fires the moment the AVAudioSession category / input / output route CHANGES
    // during a call window (polled ~750ms, emitted only on change). This is the
    // signal that was missing when video players silently seized the session
    // (category→Playback, inPort→none) on a VoIP-push cold launch and left the call
    // with no microphone — we caught that one only because a 10s tick happened to
    // land inside a sub-second window. Now every ownership change is recorded with
    // its from→to transition, so "who took the audio session, and when" is never a
    // guess again. See project_video_session_hijack_drops_calls.
    AUDIO_SESSION_CHANGED: 'call_audio_session_changed',
    // Every AVAudioSession MUTATION this app performs during a call, as an ordered
    // attributable fact: `writer` (which call site), `requested` (what we asked
    // for), `ok`, `error`, `skipped` + `skip_reason`, `duration_ms`, and a
    // before_*/after_* pair of category, mode, options, input port, output port and
    // sample rate. AUDIO_SESSION_CHANGED polls the RESULT every 750ms but never saw
    // the writes themselves or their return values, which is why three independent
    // analyses of the AirPods no-audio incident could neither confirm nor exclude
    // the connect-time write storm. Also closes the sub-750ms transient blind spot.
    SESSION_WRITE: 'call_session_write',
    // ONE row per call describing the invite→answer audio transition. Carries the
    // invite-time route/category/rate (before anything of ours touched the session),
    // the same at the connect instant and again once settled, ms_invite_to_answer,
    // and the two booleans that matter: `answered_from_a2dp` (the headset was an
    // active media sink when the call arrived, the established trigger) and
    // `bt_profile_switch_observed` (iOS actually completed the A2DP→HFP handoff).
    // Reconstructing that signature previously took grouping raw ticks by call_sid
    // across five weeks; as a cohort it is a one-line query, which is the only way
    // to tell whether a fix moved the number against an ~11 percent base rate.
    ANSWER_CONTEXT: 'call_answer_context',
    // The HUMAN says the audio is wrong, right now, in a stated direction:
    // symptom = cant_hear_them | they_cant_hear_me | echo | other, stamped with
    // the full live audio state and the last five route transitions of the call.
    // Every timestamp in the AirPods investigation had to be inferred from the
    // client's remedial actions (pulling the AirPods out); one tap replaces that
    // inference with a fact. It is also the ONLY instrument that will ever capture
    // echo, for which the app has zero measurement of any kind. Emitted from
    // reportAudioProblem in lib/telemetry/callTelemetry.ts, which also stamps a
    // matching `audio_problem_<symptom>` marker onto the following heartbeats.
    AUDIO_PROBLEM_REPORTED: 'call_audio_problem_reported',
    // iOS didReceiveMemoryWarning fired (native), surfaced on next foreground.
    // Fires BEFORE jetsam, so it is the earliest warning of the OOM path.
    MEMORY_WARNING: 'call_memory_warning',
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
    // Auto-sent "press 1" that completes the Securus accept on inbound carrier
    // calls (build-98 telemetry proved: no "1" → Securus drops at ~60s; "1" →
    // call connects). Each scheduled attempt reports {attempt, delay_ms, sent}.
    SECURUS_AUTO_ACCEPT: 'call_securus_auto_accept',
    // JS adopted a call that was answered NATIVELY on a cold launch (the
    // AttoVoipBootstrap answered before JS existed; the handoff put it in the
    // module's callMap and this event records JS hydrating from it). trigger =
    // boot_probe | foreground_probe; failed:true carries the error when the
    // probe itself blew up. Missing event after a cold answer = the JS gap of
    // b145 FASE 1A regressed — check the coldHandoff* native markers to see
    // which side broke.
    COLD_CALL_ADOPTED: 'call_cold_call_adopted',
    // The REAL Twilio disconnect reason (was a blind spot — we logged a generic
    // string for every end). clean_hangup=true → a party hung up; error_code set
    // → abnormal drop (53xxx = media/network/audio-session, 31xxx = signaling).
    // This is what distinguishes a Securus timeout from a media failure from a hangup.
    DISCONNECTED_REASON: 'call_disconnected_reason',
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
    // Audio injection — a rep plays a phone-side track (post/reel/backing beat)
    // INTO the call so the remote party hears it mixed with their mic. ATTEMPT
    // fires on every inject() with the full context (call_state,
    // since_connected_ms, source_kind, post_id) and an `outcome`: started |
    // no_active_call | not_connected | engine_unavailable | not_supported |
    // prepare_failed | engine_error — so no path is silent (mirrors DTMF).
    // STOPPED carries the reason (user_stopped | call_ended | track_ended |
    // interrupted). STATE_CHANGED is the engine snapshot tick.
    AUDIO_INJECT_ATTEMPT: 'call_audio_inject_attempt',
    AUDIO_INJECT_STARTED: 'call_audio_inject_started',
    AUDIO_INJECT_STOPPED: 'call_audio_inject_stopped',
    AUDIO_INJECT_FAILED: 'call_audio_inject_failed',
    AUDIO_INJECT_STATE_CHANGED: 'call_audio_inject_state_changed',
    // The prepare phase (download + optional audio extract) that runs BEFORE any
    // audio can be scheduled. This was the silent stall on poor service (David,
    // Aug 5): the antenna looked dead while a track downloaded over a dead link.
    // `cached` true = instant (prefetch warmed it); `timed_out` true = the
    // download blew the live-tap budget. prepare_ms/download_ms quantify it.
    AUDIO_INJECT_PREPARE: 'call_audio_inject_prepare',
    // Background cache-warm fired when the editor opens in a call, so the first
    // antenna tap is instant instead of waiting on a download. outcome:
    // already_cached | downloaded | timed_out | failed.
    AUDIO_INJECT_PREFETCH: 'call_audio_inject_prefetch',
    // CHIPMUNKS HUNTER. The single 6s diag snapshot misses the pitched-audio
    // TRANSIENT in the first seconds of a call (Aug 11: chipmunks was inferred,
    // never caught). enginesBuiltRate != sessionSampleRate is the exact signature.
    // Sampled every 1s for the first 12s; MISMATCH fires the instant it appears
    // (with all rates + elapsed_ms), SUMMARY fires once at the end (only when the
    // custom engine was actually in the path) with how many seconds were misaligned.
    ENGINE_RATE_MISMATCH: 'call_engine_rate_mismatch',
    ENGINE_RATE_SUMMARY: 'call_engine_rate_summary',
    // Why a connected creator did NOT auto-land on the recorder (fell to the feed
    // instead). reason: not_creator | no_entitlement | sub_unresolved. Closes the
    // "editor opens to feed, not the recording suite" blind spot (Anthony, Aug 11).
    LANDING_SKIPPED: 'call_landing_skipped',
    // Native audio-DEVICE swap result — THE critical signal for the "silent
    // injection" bug (device fails to install => rep hears monitor, remote hears
    // nothing). `outcome`: installed | install_returned_false | install_threw |
    // restored | restore_threw. Carries `reason` on failure + call_sid.
    AUDIO_INJECT_DEVICE: 'call_audio_inject_device',
    // Diagnostic snapshot a few seconds AFTER injection starts — pinpoints why an
    // injected reel may not reach the far party even though JS reports "started".
    // render_fail_count>0 ⇒ the record engine's manual render is failing (format
    // mismatch) so RecordCallback falls back to raw mic WITHOUT the injected audio;
    // record_cb_count==0 ⇒ the custom engine isn't Twilio's active capture device.
    AUDIO_INJECT_DIAG: 'call_audio_inject_diag',
    // Mixer multitrack record lifecycle. `action`: start | stop | fail.
    // `outcome` + has_path (did native return a file) + duration_ms + a snapshot
    // of the channel config (gain+record per channel) + metronome (enabled,bpm)
    // so we can see exactly what the rep mixed. The native record path is the
    // blind spot, so capturing its RESULT here is the only JS-visible signal.
    AUDIO_MIX_RECORD: 'call_audio_mix_record',
    AUDIO_MIX_METRONOME: 'call_audio_mix_metronome',
    AUDIO_MIX_PLAYBACK: 'call_audio_mix_playback',
    // THE diagnostic for the "answered from background → dead audio both ways +
    // bounced to feed" mother-test failure. Fires the instant a call is answered
    // (acceptIncomingCall), capturing HOW it was answered — `branch`:
    // fresh_accept | recovered_no_invite | recovered_precepted | accepted_no_call
    // (a `recovered_*`/`*_precepted` branch ⇒ CallKit accepted natively while the
    // app was backgrounded, so onConnected may never fire) — plus `app_state`
    // (background = answered from lock screen / outside the app), whether the
    // injection engine was installed for this user, and the LIVE AVAudioSession
    // snapshot (category=Playback ⇒ mic-less feed hijack = dead audio;
    // twilio_audio_enabled, input/output port, sample rate). This is what lets the
    // next iteration PROVE why the background-answer path breaks instead of infer.
    ANSWERED: 'call_answered',
    // A Record Pro editor track became transmittable (registered as nowPlaying so
    // the 📡 button can inject it into the call). Before this the editor never
    // registered nowPlaying, so playing a track reached the rep locally but NEVER
    // the far party — "mi madre no escucha las pistas". Pairs with the
    // call_audio_inject_* events (which now carry source_kind='track').
    TRACK_TRANSMIT_READY: 'call_track_transmit_ready',
    // The transmit SOURCE changed while an injection was already running — e.g.
    // finishing an in-call recording makes the new take the focused clip, so the
    // registered source swaps out from under a live injection. That is exactly
    // when "she stopped hearing it" was reported (David, Aug 2) and we had no
    // event for it: the injector keeps playing the OLD file while the UI implies
    // the new one. Carries both source URIs so the swap is provable.
    TRANSMIT_SOURCE_SWAPPED: 'call_transmit_source_swapped',
    // The post's mute button applied to the INJECTION MONITOR while transmitting
    // (the rep stops/starts hearing the shared track; the far party keeps getting
    // it — that's what 📡 controls). Before this, mute did nothing until transmit
    // was turned off, because the local player is force-muted during injection.
    AUDIO_INJECT_MONITOR: 'call_audio_inject_monitor',
    // Record Pro in-call editor (ActiveCallScreen) state. `state`: no_project (the
    // auto-landing skipped the project picker → editor would hang on the spinner),
    // loading, no_data, autocreate_created, autocreate_failed, ready. Confirms the
    // "stuck loading" bug and verifies the auto-create fix.
    RECORDER_STATE: 'call_recorder_state',
    // ONE consolidated "all variables" row per call, fired at connect + disconnect
    // (trigger). Reconstructs a failure WITHOUT interrogating the user: identity
    // (caller_from/callee_to/call_type app_to_app|carrier_pstn, local_account_id),
    // handoff (was_cold_launch, answered_via_callkit, answer_branch, app_state at
    // invite/answer/connect + timing deltas), engine bound, and the live audio
    // ground truth (audio_live_category PlayAndRecord=mic vs Playback=mic-less,
    // audio_did_activate_at, audio_twilio_enabled) — the direct "no sound" signal.
    CONTEXT: 'call_context',
    // /call → /recording hand-off OUTCOME (the "always land on record, even if
    // answered outside the app" requirement). `outcome`: reached_record |
    // bounced_to_feed | stayed. Carries entitlement state (record_upload true /
    // false / unknown-null) + subscription_hydrated + from_route so we can see the
    // transient-null-entitlement bounce (store not yet hydrated → treated as free
    // → sent to feed) that the mother test hit.
    NAV_TO_RECORD: 'call_nav_to_record',
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
    // Full audio-import funnel. This flow had ZERO telemetry, which is exactly
    // why a stuck "Importing your audio" was undiagnosable. `outcome`: started |
    // succeeded | failed | cancelled | aborted_or_timeout | picker_cancelled |
    // no_file, with size_bytes / duration_ms / error / timed_out.
    AUDIO_IMPORT: 'project_audio_import',
    // Decile-sampled byte progress during an import upload (~10 per import, not
    // hundreds). Gives the throughput CURVE, which is what separates "the user's
    // uplink is slow" from "it stalled halfway" — the single number we had before
    // (49s total) could not tell those apart.
    AUDIO_UPLOAD_PROGRESS: 'project_audio_upload_progress',
    // On-device normalisation to 8 kHz mono WAV before upload. The backend already
    // converts every import to that format, so a 27.1 MB WAV was being uploaded to
    // produce a 2.46 MB artifact. `ratio` and `encode_ms` are what prove the win is
    // real on a phone (encode time must stay far below the upload time it saves);
    // outcome=failed_fallback_to_original means we shipped the raw file as before.
    AUDIO_TRANSCODE: 'project_audio_transcode',
    CREATED: 'project_created',
    OPENED: 'project_opened',
    DELETED: 'project_deleted',
    SEGMENT_ADDED: 'project_segment_added',
    SEGMENT_REMOVED: 'project_segment_removed',
    TIMELINE_SAVED: 'project_timeline_saved',
    // How BIG the mounted editor actually is: clip count, total duration,
    // content width, and the native-view estimates behind it (waveform bars +
    // ruler marks). Fabric mounts/unmounts this tree in one synchronous
    // main-thread transaction, so these counts ARE the freeze risk — a 25-min
    // clip put ~50,000 bar views on screen and deleting it hung the app for
    // long enough to be force-killed (REACT-NATIVE-3W) with zero telemetry
    // saying why. Emitted on editor mount and stamped on clip deletion.
    TIMELINE_SCALE: 'project_timeline_scale',
    // A clip was deleted in the editor. This action previously emitted NOTHING,
    // which is why the exact moment of the Aug 3 freeze had to be reconstructed
    // from $autocapture element chains instead of read off one row.
    TIMELINE_CLIP_DELETED: 'project_timeline_clip_deleted',
    // Publish/export funnel — instrumented per phase because "Publicar tardó
    // demasiado" for an 11s take had ZERO timing telemetry, so we couldn't tell
    // if the backend mix or the download was the slow part (David, Jul 20).
    // `project_exported` carries outcome (started|succeeded|failed) + save_ms,
    // export_ms (backend mix), publish_ms (onPublish end-to-end), total_ms,
    // file_size_bytes, clip_count, timeline_duration_ms, error.
    EXPORTED: 'project_exported',
    // The device-side download of the exported WAV (inside onPublish). Isolated
    // from export_ms so we can attribute slowness to the WAV size vs the mix.
    EXPORT_DOWNLOAD: 'project_export_download',
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
    // An idempotent request was retried after a TRANSIENT failure (Railway
    // edge 502/503/504, timeout, network drop). `attempt` + `outcome` make
    // the platform's flakiness measurable and prove whether the backoff is
    // actually rescuing requests. Proven Aug 2 2026: client-observed 502s
    // never reach Kong (zero 5xx in its access log during those windows),
    // so they are edge-level and a retry is the correct client answer.
    REQUEST_RETRIED: 'api_request_retried',
  },

  // ── Errors ─────────────────────────────────────
  ERROR: {
    API_ERROR: 'error_api',
    UNHANDLED_EXCEPTION: 'error_unhandled_exception',
    NETWORK_ERROR: 'error_network',
  },

  // ── Social graph ───────────────────────────────
  SOCIAL: {
    // Outcome layer for optimistic social mutations (see socialTelemetry.ts).
    // ONE event with an `action` dimension: like/unlike, bookmark, repost,
    // comment_create/edit/delete, follow/unfollow, each carrying
    // outcome=applied|failed (+ error and http_status when it failed). The
    // pre-existing per-action events still fire untouched; this is the layer
    // that says what actually HAPPENED, which the intent-time events cannot.
    ACTION: 'social_action',
    // Fires ONLY when a number on screen disagrees with the server after a
    // mutation reconciles — a zero-noise alarm. This is the signal that would
    // have surfaced the Aug 23 comment badge (shown 1, server 3) by itself.
    COUNTER_DIVERGENCE: 'social_counter_divergence',
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
