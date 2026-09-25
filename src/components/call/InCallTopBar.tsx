import { useEffect, useState, useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Mic,
  MicOff,
  Volume1,
  Volume2,
  Phone,
  Grid3x3,
  SlidersHorizontal,
  Pause,
  Play,
  Radio,
  Square,
  SignalLow,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { StatusBar } from 'expo-status-bar';
import { GlassSurface } from '@/components/navigation/GlassSurface';
import { HeaderBlur } from '@/components/ui/HeaderBlur';
import { useCallStore } from '@/stores/callStore';
import { useNowPlayingStore } from '@/stores/nowPlayingStore';
import { isCallConnected, isOnCallScreen } from '@/hooks/useInCallChrome';
import { hangUpCall, toggleMuteCall, toggleSpeaker } from '@/hooks/useTwilioVoice';
import { useCallAudioInjection } from '@/hooks/useCallAudioInjection';
import { preloadCallSounds } from '@/lib/sound/callSounds';
import { haptic } from '@/lib/haptics/hapticService';
import { openKeypad } from './DtmfKeypadHost';
import { openMixer } from './MixerHost';
import { analytics, ANALYTICS_EVENTS, useFeatureFlag } from '@/lib/analytics';
import { mixerService } from '@/lib/callAudio/mixerService';
import { AUDIO_INJECTION_FLAG } from '@/lib/callAudio/createAudioInjector';
import { getCallPlaybackController } from '@/lib/callAudio/session/controllerInstance';
import { showToast } from '@/components/ui/Toast';
import * as Sentry from '@sentry/react-native';

/** Consecutive diag samples with no far party progress before the watchdog acts. */
const SILENT_TRANSMIT_SAMPLES = 3;

/**
 * Call bar color experiment (Sep 19 2026): David wants to see the top fade in
 * white instead of the green it has always been. Flip this one value to
 * compare; the timer and live dot follow so they stay readable on either.
 */
const CALL_BAR_THEME = 'white' as 'green' | 'white';
// The timer and live dot stay white on both: David found black unreadable
// on the white fade over the feed.
// White starts at a full 100% white at the top edge over a light frost; the
// default 55% veil over dark frost read as cream.
const CALL_BAR =
  CALL_BAR_THEME === 'white'
    ? { tintRgb: '255, 255, 255', fg: '#FFFFFF', maxAlpha: 1, blurTint: 'light' as const }
    : {
        tintRgb: '34, 197, 94',
        fg: '#FFFFFF',
        maxAlpha: undefined,
        blurTint: 'dark' as const,
      };

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${String(h).padStart(2, '0')}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

export function InCallTopBar() {
  const { t } = useTranslation('calls');
  const activeCall = useCallStore((s) => s.activeCall);
  const networkWeak = useCallStore((s) => s.networkWeak);
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [elapsed, setElapsed] = useState(0);
  // Mixer button shows only when the audio-injection feature is on (same flag).
  const mixerEnabled = useFeatureFlag(AUDIO_INJECTION_FLAG) === true;
  // General "transmit app audio into the call" control: injects whatever the
  // user last played in the feed/reels (nowPlaying), not a specific post.
  const { canInject, isInjecting, isPreparing, inject, stop } = useCallAudioInjection();
  const nowPlaying = useNowPlayingStore((s) => s.track);
  // Call playback session (Sep 15 2026). In engine mode 📡 is ONLY a gate: it
  // never starts or stops anything; the transport of whatever surface owns the
  // session decides what is heard, and the gate decides whether the far party
  // hears the same. Starts OFF on every call (CallPlaybackHost resets it).
  const playback = useCallStore((s) => s.playback);
  const engineMode = playback.engineMode;

  // Transmit is a MODE: tap 📡 → push the audio the user is playing RIGHT NOW into
  // the call; tap again → stop. The source is LOCKED at turn-on and does NOT change
  // when other audio starts. This was the "mystery audio" bug (David, Jul 14): the
  // old design followed nowPlaying live, so a background ad/feed video autoplaying
  // mid-call HIJACKED the transmit — telemetry caught it injecting `ad-0ec56a1d…`.
  // To transmit something else, toggle transmit off then on with it playing.
  const [transmitMode, setTransmitMode] = useState(false);
  const [lockedSource, setLockedSource] = useState<typeof nowPlaying>(null);

  /**
   * The call's session is playing something and the screen in front of the
   * user is not the one that owns it, so this bar is the only place left to
   * stop it. The editor draws its own transport, so there this stays away.
   */
  const ownerScreenIsUp =
    playback.surface === 'timeline' && pathname.startsWith('/project/');
  const showTransport =
    engineMode &&
    !ownerScreenIsUp &&
    (playback.status === 'playing' || playback.status === 'paused');

  const onTransport = () => {
    void haptic('selection');
    const controller = getCallPlaybackController();
    const owner = playback.ownerId;
    if (!owner) return;
    analytics.capture(ANALYTICS_EVENTS.CALL.PLAYBACK_TRANSPORT_FROM_BAR, {
      action: playback.status === 'playing' ? 'pause' : 'play',
      owner_id: owner,
      owner_surface: playback.surface,
      transmit: playback.transmit,
      position_ms: Math.round(playback.positionMs),
    });
    if (playback.status === 'playing') void controller.pause(owner);
    else void controller.play(owner);
  };

  const onTransmit = () => {
    void haptic('selection');
    if (engineMode) {
      void getCallPlaybackController().setTransmit(!playback.transmit, {
        surface: 'call_bar',
        micMuted: !!activeCall?.isMuted,
      });
      return;
    }
    const next = !transmitMode;
    // Snapshot what's playing at THIS instant and lock it for the whole session.
    const src = next ? useNowPlayingStore.getState().track : null;
    setLockedSource(src);
    setTransmitMode(next);
    analytics.capture(ANALYTICS_EVENTS.CALL.AUDIO_INJECT_STATE_CHANGED, {
      transmit_mode: next ? 'on' : 'off',
      has_now_playing: !!src,
      source_kind: src?.kind ?? null,
      is_video: src?.isVideo ?? false,
      post_id: src?.postId ?? null,
    });
  };

  // If transmit was turned ON before anything was playing (lockedSource null),
  // lock the FIRST source that starts (one-shot) — then never change it. Without
  // this the button shows ON but transmits nothing until toggled again. Still
  // immune to hijack: once locked, background autoplay is ignored.
  useEffect(() => {
    if (transmitMode && !lockedSource && nowPlaying) setLockedSource(nowPlaying);
  }, [transmitMode, lockedSource, nowPlaying?.uri]);

  // Inject the LOCKED source (captured at turn-on). Depends on the locked source,
  // NOT nowPlaying, so background autoplay can never swap what's transmitted.
  useEffect(() => {
    if (!transmitMode || !lockedSource) return;
    let cancelled = false;
    void inject(lockedSource).then((result) => {
      // If prepare/engine failed, drop the mode back to OFF so the button returns
      // to Radio instead of showing a false red "transmitting" square. The toast
      // from inject() already told the user why; a clean tap retries (instant now
      // that the track has cached). 'superseded' means the user turned it off
      // themselves mid-prepare, so leave their choice alone.
      if (cancelled) return;
      if (!result.ok && result.reason !== 'superseded') {
        setTransmitMode(false);
        setLockedSource(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [transmitMode, lockedSource?.uri, inject]);

  // Stop the moment the user turns the mode off.
  useEffect(() => {
    if (!transmitMode && isInjecting) void stop('user_stopped');
  }, [transmitMode, isInjecting, stop]);

  // Reset transmit state when the call ENDS. InCallTopBar is mounted once for the
  // app's whole life and only renders null when disconnected — it never unmounts,
  // so without this, leaving transmit ON at hang-up leaves transmitMode/lockedSource
  // set into the NEXT call: the button shows ON but the inject effect's deps are
  // unchanged so it never re-fires → transmit silently does nothing until toggled.
  useEffect(() => {
    if (!isCallConnected(activeCall?.state)) {
      setTransmitMode(false);
      setLockedSource(null);
    }
  }, [activeCall?.state]);

  // Snapshot the native engine mix diagnostics → PostHog. `trigger` distinguishes
  // the auto (every connected call, ~6s in) snapshot from the inject-triggered one.
  const captureDiag = useCallback(
    async (trigger: string) => {
      try {
        const diag = await mixerService.getMixDiagnostics();
        analytics.capture(ANALYTICS_EVENTS.CALL.AUDIO_INJECT_DIAG, {
          diag_trigger: trigger,
          record_cb_count: diag?.recordCbCount ?? null,
          render_fail_count: diag?.renderFailCount ?? null,
          // Aug 2 2026 — the two counters production was missing.
          // inject_frames_to_capture is THE far-party proof: frames actually
          // handed to Twilio while an injection was live. 0 during a transmit
          // means she received nothing, regardless of what the UI shows.
          // (app_frames was wrongly believed to mean this; it only moves while a
          // mix RECORDING is running, so it reads 0 almost always.)
          inject_frames_to_capture: diag?.injectFramesToCapture ?? null,
          inject_active: diag?.injectActive ?? null,
          // Split render failures. cannot_do_in_context = a node property was
          // written while the engine rendered — the failure a LIVE fader would
          // cause, so this gates whether live mixing is viable. `other` is the
          // genuine can't-mix class that produces dead audio. Baseline before
          // this split: render_fail_count > 0 on 24% of transmitting calls.
          render_fail_cannot_do_in_context: diag?.renderFailCannotDoInContext ?? null,
          render_fail_other: diag?.renderFailOther ?? null,
          // >0 ⇒ an interruption ended, the unit was restarted, and the capture
          // callbacks never resumed (silent starvation). We force a rebuild when
          // that happens; this says how often it was needed.
          resume_starved_count: diag?.resumeStarvedCount ?? null,
          // >0 ⇒ the recording consumer gave up waiting for late mic samples and
          // let the far party drive the file clock, which shifts the two channels
          // apart for the rest of the take. The signal behind "my voice doesn't
          // line up with the track".
          mic_starved_fallbacks: diag?.micStarvedFallbacks ?? null,
          playout_cb_count: diag?.playoutCbCount ?? null,
          // stopFile forensics (Aug 3 ghost tail): a lag in the SECONDS while
          // inject frames kept climbing = the stop sat behind a busy main thread.
          stop_file_calls: diag?.stopFileCalls ?? null,
          last_stop_file_lag_ms: diag?.lastStopFileLagMs ?? null,
          // The 3 signals that pinpoint where injection dies:
          record_engine_running: diag?.recordEngineRunning ?? null,
          record_player_playing: diag?.recordPlayerPlaying ?? null,
          playout_player_playing: diag?.playoutPlayerPlaying ?? null,
          // build 83: is Twilio even driving the device? (bound vs AudioUnit-not-pumping)
          start_capturing_count: diag?.startCapturingCount ?? null,
          start_rendering_count: diag?.startRenderingCount ?? null,
          // build 87: session-active confirmation (recordCbCount hundreds + real rate = fixed)
          session_sample_rate: diag?.sessionSampleRate ?? null,
          session_is_play_and_record: diag?.sessionIsPlayAndRecord ?? null,
          // build 92: injected-pitch pinpoint — file/dest/engine rates must agree
          last_inject_file_rate: diag?.lastInjectFileRate ?? null,
          last_inject_dest_rate: diag?.lastInjectDestRate ?? null,
          engines_built_rate: diag?.enginesBuiltRate ?? null,
          // build 93: negotiated (Twilio-facing) rates — engines must match these
          rendering_format_rate: diag?.renderingFormatRate ?? null,
          capturing_format_rate: diag?.capturingFormatRate ?? null,
          // build 88: AudioUnit lifecycle — starvation (all 0) vs explicit stop
          audio_unit_start_count: diag?.audioUnitStartCount ?? null,
          audio_unit_stop_count: diag?.audioUnitStopCount ?? null,
          teardown_audio_unit_count: diag?.teardownAudioUnitCount ?? null,
          interruption_began_count: diag?.interruptionBeganCount ?? null,
          route_rebuild_count: diag?.routeRebuildCount ?? null,
          // Aug 3 2026: route + format attribution on the RENDER half, added
          // alongside the engine-side fixes for the AirPods no-audio incident.
          // route_reason_counts is an ARRAY of 9 counters indexed by the raw
          // AVAudioSessionRouteChangeReason (0 Unknown, 1 NewDeviceAvailable,
          // 2 OldDeviceUnavailable, 3 CategoryChange, 4 Override, 6 WakeFromSleep,
          // 7 NoSuitableRouteForCategory, 8 RouteConfigurationChange); the engine
          // read that reason on every notification and threw it away, so even with
          // the engine in the path we could not say WHY it rebuilt.
          route_reason_counts: diag?.routeReasonCounts ?? null,
          last_route_reason: diag?.lastRouteReason ?? null,
          last_route_reason_at: diag?.lastRouteReasonAt ?? null,
          // Every notification, INCLUDING the ones the engine's switch ignores.
          route_change_notify_count: diag?.routeChangeNotifyCount ?? null,
          // >0 ⇒ route changes arrived while the AudioUnit was NULL (the whole
          // teardown-and-rebuild window) and used to be discarded forever, leaving
          // the render engine built at a stale rate with no correction path.
          // recheck_count says how many of those a later start hook picked back up.
          route_change_dropped_count: diag?.routeChangeDroppedCount ?? null,
          route_change_rechecked_count: diag?.routeChangeRecheckedCount ?? null,
          // >0 ⇒ the old comparand (_renderingFormat, re-latched underneath us) and
          // the correct one (_enginesBuiltFormat) disagreed, i.e. a rebuild the
          // shipped code was silently skipping. This is the measurement that says
          // whether that hole was ever actually hit in production.
          route_rebuild_disagree_count: diag?.routeRebuildDisagreeCount ?? null,
          // >0 ⇒ activating the session MOVED the sample rate after Twilio had
          // already latched a format. That is the A2DP-to-HFP answer signature
          // (48000 latched, 24000 after activation). realign_scheduled_count is how
          // often we acted on it, which only ever happens inside the cohort.
          session_rate_flip_count: diag?.sessionRateFlipCount ?? null,
          format_realign_scheduled_count: diag?.formatRealignScheduledCount ?? null,
          // Which side of `engine_render_format_recheck` this call ran on, so the
          // two cohorts are separable in one query.
          render_format_recheck_enabled: diag?.renderFormatRecheckEnabled ?? null,
          set_active_fail_count: diag?.setActiveFailCount ?? null,
          mic_frames: diag?.micFrames ?? null,
          remote_frames: diag?.remoteFrames ?? null,
          app_frames: diag?.appFrames ?? null,
          source_kind: nowPlaying?.kind ?? null,
          is_video: nowPlaying?.isVideo ?? false,
          // build 89: transmit-button availability — WHY a reel+transmit may not fire.
          // can_inject==false ⇒ the 📡 button isn't shown (flag/capability off);
          // has_now_playing==false ⇒ no reel registered as nowPlaying to inject.
          can_inject: canInject,
          has_now_playing: !!nowPlaying,
          mixer_enabled: mixerEnabled,
          transmit_mode: transmitMode,
          // Call playback session (Sep 15 2026): the gate, the owner and the
          // native session counters, so "did the far party get it" is answered
          // from one row.
          engine_mode: engineMode,
          transmit_gate: diag?.transmitGate ?? null,
          transmit_gate_on_count: diag?.transmitGateOnCount ?? null,
          session_state: String(diag?.sessionState ?? ''),
          session_position_ms: diag?.sessionPositionMs ?? null,
          session_generation: diag?.sessionGeneration ?? null,
          session_reschedule_count: diag?.sessionRescheduleCount ?? null,
          spurious_completion_ignored_count: diag?.spuriousCompletionIgnoredCount ?? null,
          session_load_count: diag?.sessionLoadCount ?? null,
          last_session_load_ms: diag?.lastSessionLoadMs ?? null,
          session_loop_iterations: diag?.sessionLoopIterations ?? null,
          session_ended_count: diag?.sessionEndedCount ?? null,
          session_idle_pauses: diag?.sessionIdlePauses ?? null,
          session_halt_count: diag?.sessionHaltCount ?? null,
          last_stem_file_rate: diag?.lastStemFileRate ?? null,
          last_stem_dest_rate: diag?.lastStemDestRate ?? null,
          engine_build_seq: diag?.engineBuildSeq ?? null,
          stem_pool_size: diag?.stemPoolSize ?? null,
          stem_record_playing: diag?.stemRecordPlaying ?? null,
          stem_record_volume: diag?.stemRecordVolume ?? null,
          playback_owner_surface: playback.surface,
          playback_status: playback.status,
          playback_source_kind: playback.source?.kind ?? null,
        });
      } catch {
        // diagnostics unavailable — ignore
      }
    },
    [
      nowPlaying,
      canInject,
      mixerEnabled,
      transmitMode,
      engineMode,
      playback.surface,
      playback.status,
      playback.source?.kind,
    ]
  );

  // Engine mode: snapshot ~3.5s after the far party should have started hearing
  // something (gate open + playing), the analogue of the legacy inject trigger.
  const sessionLive = engineMode && playback.transmit && playback.status === 'playing';
  useEffect(() => {
    if (!sessionLive) return;
    const id = setTimeout(() => void captureDiag('session_transmit'), 3500);
    return () => clearTimeout(id);
  }, [sessionLive, playback.ownerId, captureDiag]);

  // Inject-triggered snapshot (~3.5s after transmit) — WHY an injected reel may not
  // reach the far party.
  useEffect(() => {
    if (!isInjecting) return;
    const id = setTimeout(() => void captureDiag('inject'), 3500);
    return () => clearTimeout(id);
  }, [isInjecting, nowPlaying?.uri, captureDiag]);

  // build 89: AUTO snapshot ~6s into EVERY connected call — no reel/transmit needed.
  // This is the reliable path to the AudioUnit lifecycle counters (the transmit flow
  // needs a reel playing, which is easy to miss), so any normal call now reports
  // whether the unit starved vs was stopped.
  useEffect(() => {
    if (!isCallConnected(activeCall?.state)) return;
    const id = setTimeout(() => void captureDiag('auto_connect'), 6000);
    return () => clearTimeout(id);
  }, [activeCall?.state, captureDiag]);

  // CHIPMUNKS HUNTER (Aug 11). The pitched-audio bug is a TRANSIENT in the first
  // few seconds — the engine builds at a stale rate before the realign corrects it
  // — and the single 6s snapshot above misses it, so it has only ever been
  // inferred, never caught. Sample the engine vs session rate every second for the
  // first 12s. enginesBuiltRate != sessionSampleRate is the exact chipmunks
  // signature; fire the instant it appears. The end-summary fires only when the
  // custom engine was actually pumping, so plain (no-injection) calls stay quiet.
  useEffect(() => {
    if (!isCallConnected(activeCall?.state)) return;
    const sid = activeCall?.callSid ?? null;
    const startedAt = Date.now();
    let firstMismatchReported = false;
    let mismatchSamples = 0;
    let engineWasActive = false;
    let worst: { built: number; session: number; rendering: number } | null = null;

    // WHOLE-CALL COVERAGE (build 156). This used to stop after 12 seconds, which
    // made the most common cause INVISIBLE: the session rate flips when a
    // Bluetooth device connects MID-CALL (48k -> 24k HFP), and the engines stay
    // built at the old rate until they realign. Audio rendered through a graph
    // built at 2x the session rate plays at DOUBLE SPEED — the client's "the
    // Securus message was sped up", with the realign itself audible as the
    // "hiccups" he heard. That call's mismatch happened outside the 12s window,
    // so the summary said clean=true while he was listening to chipmunks.
    // Now: 1s cadence through the first 15s (the answer window), then every 5s
    // for the rest of the call, and EVERY episode is reported, not just the first.
    let tick = 0;
    let inEpisode = false;
    let episodes = 0;
    let episodeStartedAt = 0;
    let worstEpisodeMs = 0;
    // SILENT TRANSMIT WATCHDOG (Sep 15 2026), riding on the same samples. With
    // the gate open and the session playing, two things must advance: the
    // session's own position (else the stem players stalled: one self heal by
    // restarting at the current second) and injectFramesToCapture (else the
    // capture callback is dead: no reschedule can help, tell the user and Sentry).
    let lastSessionPos = -1;
    let stalledSamples = 0;
    let lastInjectFrames = -1;
    let flatCaptureSamples = 0;
    let healedOnce = false;
    let captureDeadReported = false;
    const id = setInterval(() => {
      tick += 1;
      // After the answer window, sample every 5th tick (5s) — enough to catch a
      // route-driven flip, cheap enough for a 20-minute call.
      if (tick > 15 && tick % 5 !== 0) return;
      void (async () => {
        const d = await mixerService.getMixDiagnostics();
        if (!d) return;
        const pb = useCallStore.getState().playback;
        // PLAYBACK PROGRESS (Sep 23 2026, David: all the telemetry possible).
        // Every sample while the session plays, gate open or not, so a "kept
        // sounding after the clip ended" report is answered from the stems.
        if (pb.engineMode && pb.status === 'playing') {
          analytics.capture(ANALYTICS_EVENTS.CALL.PLAYBACK_PROGRESS, {
            call_sid: sid,
            owner_surface: pb.surface,
            transmit: pb.transmit,
            js_position_ms: Math.round(pb.positionMs),
            session_position_ms: d.sessionPositionMs ?? null,
            session_state: d.sessionState ?? null,
            transmit_gate: d.transmitGate ?? null,
            stem_record_playing: d.stemRecordPlaying ?? null,
            stem_record_volume: d.stemRecordVolume ?? null,
            inject_frames_to_capture: d.injectFramesToCapture ?? null,
            mic_frames: d.micFrames ?? null,
            remote_frames: d.remoteFrames ?? null,
            app_frames: d.appFrames ?? null,
            session_reschedule_count: d.sessionRescheduleCount ?? null,
            spurious_completion_ignored_count: d.spuriousCompletionIgnoredCount ?? null,
          });
        }
        if (pb.engineMode && pb.transmit && pb.status === 'playing') {
          const pos = Number(d.sessionPositionMs ?? -1);
          const frames = Number(d.injectFramesToCapture ?? -1);
          stalledSamples = pos === lastSessionPos ? stalledSamples + 1 : 0;
          flatCaptureSamples = frames === lastInjectFrames ? flatCaptureSamples + 1 : 0;
          lastSessionPos = pos;
          lastInjectFrames = frames;
          if (stalledSamples >= SILENT_TRANSMIT_SAMPLES) {
            stalledSamples = 0;
            const healed = !healedOnce;
            analytics.capture(ANALYTICS_EVENTS.CALL.TRANSMIT_SILENT_DETECTED, {
              call_sid: sid,
              class: 'player_stalled',
              healed,
              position_ms: pos,
              inject_frames: frames,
              owner_surface: pb.surface,
            });
            if (healed && pb.ownerId) {
              healedOnce = true;
              void getCallPlaybackController().play(pb.ownerId);
            }
          } else if (
            flatCaptureSamples >= SILENT_TRANSMIT_SAMPLES &&
            !captureDeadReported
          ) {
            captureDeadReported = true;
            analytics.capture(ANALYTICS_EVENTS.CALL.TRANSMIT_SILENT_DETECTED, {
              call_sid: sid,
              class: 'capture_dead',
              healed: false,
              position_ms: pos,
              inject_frames: frames,
              record_cb_count: Number(d.recordCbCount ?? 0),
              owner_surface: pb.surface,
            });
            Sentry.captureMessage('call_transmit_silent_capture_dead', {
              level: 'warning',
              extra: { call_sid: sid, position_ms: pos, inject_frames: frames },
            });
            showToast(t('transmit.silentDetected'));
          }
        } else {
          lastSessionPos = -1;
          lastInjectFrames = -1;
          stalledSamples = 0;
          flatCaptureSamples = 0;
        }
        const built = Number(d.enginesBuiltRate ?? 0);
        const session = Number(d.sessionSampleRate ?? 0);
        const rendering = Number(d.renderingFormatRate ?? 0);
        const active =
          Number(d.recordCbCount ?? 0) > 0 || Number(d.playoutCbCount ?? 0) > 0;
        if (active) engineWasActive = true;
        const mismatch =
          active &&
          built > 0 &&
          session > 0 &&
          (built !== session || (rendering > 0 && rendering !== session));
        if (mismatch) {
          mismatchSamples += 1;
          worst = { built, session, rendering };
          if (!inEpisode) {
            // Start of a NEW mismatch episode (the audible artifact begins here).
            inEpisode = true;
            episodes += 1;
            episodeStartedAt = Date.now();
            firstMismatchReported = true;
            const capturing = Number(d.capturingFormatRate ?? 0);
            // TRUE audible speed (build 160). The old ratio was built/session, so
            // a call where built==session but RENDERING ran at half the session
            // rate (48000 vs 24000, David Aug 26) reported speed=1.0 and read as
            // clean — while the far end played at DOUBLE speed. What you HEAR is
            // driven by the rate the RENDER graph produces vs the rate the
            // session consumes: session/rendering. Report whichever format
            // actually diverged so the number matches the symptom.
            const renderRatio = rendering > 0 && session > 0 ? session / rendering : 1;
            const builtRatio = built > 0 && session > 0 ? built / session : 1;
            const speedRatio =
              Math.abs(renderRatio - 1) >= Math.abs(builtRatio - 1)
                ? renderRatio
                : builtRatio;
            analytics.capture(ANALYTICS_EVENTS.CALL.ENGINE_RATE_MISMATCH, {
              call_sid: sid,
              elapsed_ms: Date.now() - startedAt,
              episode_index: episodes,
              engines_built_rate: built,
              session_sample_rate: session,
              rendering_format_rate: rendering,
              capturing_format_rate: capturing,
              // Which side is wrong, so the fix knows where to look.
              built_matches_session: built === session,
              rendering_matches_session: rendering === session,
              capturing_matches_session: capturing === session,
              // The audible consequence: >1 plays FAST (chipmunks), <1 slow.
              // Now derived from the format that actually diverged, not just built.
              playback_speed_ratio: Number(speedRatio.toFixed(3)),
              output_port: String(d.outputPort ?? ''),
            });
          }
        } else if (inEpisode) {
          // Episode ended (the engine realigned). Record how long the artifact lasted.
          inEpisode = false;
          const ms = Date.now() - episodeStartedAt;
          if (ms > worstEpisodeMs) worstEpisodeMs = ms;
        }
      })();
    }, 1000);

    return () => {
      clearInterval(id);
      if (!engineWasActive) return; // plain call, nothing to report
      if (inEpisode) {
        const ms = Date.now() - episodeStartedAt;
        if (ms > worstEpisodeMs) worstEpisodeMs = ms;
      }
      // Summary now fires when the CALL ENDS, covering its whole duration.
      analytics.capture(ANALYTICS_EVENTS.CALL.ENGINE_RATE_SUMMARY, {
        call_sid: sid,
        mismatch_samples: mismatchSamples,
        mismatch_episodes: episodes,
        worst_episode_ms: worstEpisodeMs,
        still_mismatched_at_end: inEpisode,
        call_duration_ms: Date.now() - startedAt,
        clean: mismatchSamples === 0,
        worst_built_rate: worst?.built ?? null,
        worst_session_rate: worst?.session ?? null,
        worst_rendering_rate: worst?.rendering ?? null,
        // True worst speed: the format (built OR rendering) that diverged most
        // from the session, so a rendering-only mismatch is no longer invisible.
        worst_speed_ratio: (() => {
          if (!worst || worst.session <= 0) return null;
          const r = worst.rendering > 0 ? worst.session / worst.rendering : 1;
          const b = worst.built > 0 ? worst.built / worst.session : 1;
          const ratio = Math.abs(r - 1) >= Math.abs(b - 1) ? r : b;
          return Number(ratio.toFixed(3));
        })(),
      });
    };
    // t is stable (i18n instance); the watchdog reads the store imperatively.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCall?.state, activeCall?.callSid]);

  const isConnected = isCallConnected(activeCall?.state);

  // Warm the DTMF + end-call players the moment a call is live, so the first
  // keypad tap / hang-up is instant (no allocation on the interaction).
  useEffect(() => {
    if (isConnected) preloadCallSounds();
  }, [isConnected]);

  // Hide on the dedicated call screen (it has its own controls)
  const onCallScreen = isOnCallScreen(pathname);

  // Elapsed timer
  useEffect(() => {
    if (!isConnected || !activeCall?.connectedAt) {
      setElapsed(0);
      return;
    }
    const tick = () => {
      const diff = Math.floor(
        (Date.now() - new Date(activeCall.connectedAt!).getTime()) / 1000
      );
      setElapsed(Math.max(0, diff));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isConnected, activeCall?.connectedAt]);

  if (!isConnected || onCallScreen) return null;

  return (
    <View style={[styles.bar, { paddingTop: insets.top }]}>
      {/* Green frosted-blur that dissolves downward (like the search bar's blur,
          but green) — an OVERLAY that does NOT push content (reels/feed layouts
          untouched); screens reserve room below via useScreenTopInset. Green
          lives ONLY here, never on the screen headers. */}
      <HeaderBlur
        tintRgb={CALL_BAR.tintRgb}
        fadeExtend={28}
        maxAlpha={CALL_BAR.maxAlpha}
        blurTint={CALL_BAR.blurTint}
      />
      {/* System time and battery would vanish on the white top edge. */}
      {CALL_BAR_THEME === 'white' ? <StatusBar style="dark" /> : null}
      <View style={styles.content}>
        {/* Same dark glass as the buttons so the timer reads on any fade. */}
        <GlassSurface radius={17} style={styles.timerPill}>
          <View style={styles.timerContainer}>
            <View style={[styles.liveDot, { backgroundColor: CALL_BAR.fg }]} />
            <Text style={[styles.timer, { color: CALL_BAR.fg }]}>
              {formatElapsed(elapsed)}
            </Text>
          </View>
        </GlassSurface>

        <GlassSurface radius={21} style={styles.glassBtn}>
          <TouchableOpacity
            style={[styles.glassBtnInner, activeCall?.isMuted && styles.glassBtnActive]}
            onPress={toggleMuteCall}
          >
            {activeCall?.isMuted ? (
              <MicOff size={20} color="#FFF" strokeWidth={2.25} />
            ) : (
              <Mic size={20} color="#FFF" strokeWidth={2.25} />
            )}
          </TouchableOpacity>
        </GlassSurface>

        <GlassSurface radius={21} style={styles.glassBtn}>
          <TouchableOpacity
            style={[styles.glassBtnInner, activeCall?.isSpeaker && styles.glassBtnActive]}
            onPress={toggleSpeaker}
          >
            {activeCall?.isSpeaker ? (
              <Volume2 size={20} color="#FFF" strokeWidth={2.25} />
            ) : (
              <Volume1 size={20} color="#FFF" strokeWidth={2.25} />
            )}
          </TouchableOpacity>
        </GlassSurface>

        <GlassSurface radius={21} style={styles.glassBtn}>
          <TouchableOpacity style={styles.glassBtnInner} onPress={openKeypad}>
            <Grid3x3 size={20} color="#FFF" strokeWidth={2.25} />
          </TouchableOpacity>
        </GlassSurface>

        {/* The audio-problem report button lived here for exactly one build (136)
            and was removed at David's direction (Aug 3): the passive telemetry
            (per-second stats, route reasons, session writes) proved sufficient to
            diagnose incidents without asking the user to self-report, and every
            slot in this bar is contested. The sheet + reportAudioProblem plumbing
            stay (AudioProblemHost), dormant, for a future entry point elsewhere. */}

        {/* Transmit the app's currently-playing audio INTO the call (flag-gated).
            Spinner while the track is PREPARING (downloading/decoding) so a slow
            prepare on poor service never looks dead (David, Aug 5); red Square
            while transmitting; Radio otherwise. */}
        {engineMode ? (
          // Engine mode: a GATE. Off = outline; armed (on, nothing playing) =
          // filled; live (on, playing) = filled + dot; mic muted = dimmed, because
          // Twilio's mute silences the whole uplink including the shared audio.
          <GlassSurface radius={21} style={styles.glassBtn}>
            <TouchableOpacity
              style={[styles.glassBtnInner, playback.transmit && styles.glassBtnActive]}
              onPress={onTransmit}
              accessibilityRole="switch"
              accessibilityState={{ checked: playback.transmit }}
              accessibilityLabel={
                playback.transmit ? t('transmit.a11yOn') : t('transmit.a11yOff')
              }
              accessibilityHint={
                playback.transmit
                  ? activeCall?.isMuted
                    ? t('transmit.mutedByMic')
                    : playback.status === 'playing'
                      ? t('transmit.live')
                      : t('transmit.armed')
                  : undefined
              }
            >
              <View
                style={
                  activeCall?.isMuted && playback.transmit ? styles.dimmed : undefined
                }
              >
                <Radio
                  size={20}
                  color="#FFF"
                  fill={playback.transmit ? 'rgba(255,255,255,0.35)' : 'transparent'}
                  strokeWidth={2.25}
                />
              </View>
              {playback.transmit &&
              playback.status === 'playing' &&
              !activeCall?.isMuted ? (
                <View style={styles.liveBadge} />
              ) : null}
            </TouchableOpacity>
          </GlassSurface>
        ) : canInject ? (
          <GlassSurface radius={21} style={styles.glassBtn}>
            <TouchableOpacity
              style={[styles.glassBtnInner, transmitMode && styles.glassBtnActive]}
              onPress={onTransmit}
            >
              {isPreparing ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : transmitMode ? (
                <Square size={18} color="#FFF" fill="#FFF" strokeWidth={2.25} />
              ) : (
                <Radio size={20} color="#FFF" strokeWidth={2.25} />
              )}
            </TouchableOpacity>
          </GlassSurface>
        ) : null}

        {/* Transport, only away from the screen that owns the session.
            The session belongs to the call and no longer dies when a screen
            unmounts (Sep 25 2026), so walking out of the editor with a track
            running must not leave audio nobody can stop. On the editor itself
            this stays hidden: that screen has its own transport, and a second
            button for the same thing is what the client complained about. */}
        {showTransport ? (
          <GlassSurface radius={21} style={styles.glassBtn}>
            <TouchableOpacity
              style={styles.glassBtnInner}
              onPress={onTransport}
              accessibilityRole="button"
              accessibilityLabel={
                playback.status === 'playing'
                  ? t('controls.pause', { defaultValue: 'Pause' })
                  : t('controls.play', { defaultValue: 'Play' })
              }
            >
              {playback.status === 'playing' ? (
                <Pause size={18} color="#FFF" fill="#FFF" strokeWidth={2.25} />
              ) : (
                <Play size={18} color="#FFF" fill="#FFF" strokeWidth={2.25} />
              )}
            </TouchableOpacity>
          </GlassSurface>
        ) : null}

        {/* Mixer — opens the multitrack recording mixer (flag-gated). */}
        {mixerEnabled ? (
          <GlassSurface radius={21} style={styles.glassBtn}>
            <TouchableOpacity style={styles.glassBtnInner} onPress={openMixer}>
              <SlidersHorizontal size={20} color="#FFF" strokeWidth={2.25} />
            </TouchableOpacity>
          </GlassSurface>
        ) : null}

        <GlassSurface radius={21} style={styles.glassBtn}>
          <TouchableOpacity
            style={[styles.glassBtnInner, styles.hangUpTint]}
            onPress={hangUpCall}
          >
            <View style={styles.hangUpIcon}>
              <Phone size={20} color="#FFF" strokeWidth={2.25} />
            </View>
          </TouchableOpacity>
        </GlassSurface>
      </View>

      {/* Weak-signal indicator: its OWN thin row below the controls, so it never
          competes with the button layout (David, Aug 11: as a sibling in the
          space-between row it crowded everything). Tells the user a rough call is
          their connection, not the app. Driven by Twilio's quality warnings. */}
      {networkWeak ? (
        <View style={styles.weakRow}>
          <View style={styles.weakChip}>
            <SignalLow size={12} color="#FCD34D" strokeWidth={2.5} />
            <Text style={styles.weakChipText}>
              {t('common:net.weakConnection', { defaultValue: 'Weak signal' })}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    // The green frosted blur (HeaderBlur) is the background; let its fade spill
    // below the bar so the green dissolves smoothly into the content.
    overflow: 'visible',
  },
  glassBtn: {
    width: 42,
    height: 42,
  },
  hangUpTint: {
    backgroundColor: 'rgba(239, 68, 68, 0.6)',
  },
  glassBtnInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassBtnActive: {
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  dimmed: {
    opacity: 0.45,
  },
  liveBadge: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#FFF',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  timerPill: {
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFF',
  },
  weakRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: -2,
    paddingBottom: 6,
  },
  weakChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 11,
    backgroundColor: 'rgba(252, 211, 77, 0.15)',
  },
  weakChipText: {
    color: '#FCD34D',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 11,
  },
  timer: {
    color: '#FFF',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 14,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  btn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnActive: {
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  hangUpBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hangUpIcon: {
    transform: [{ rotate: '135deg' }],
  },
});
