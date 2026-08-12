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
  Radio,
  Square,
  SignalLow,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
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

  // Transmit is a MODE: tap 📡 → push the audio the user is playing RIGHT NOW into
  // the call; tap again → stop. The source is LOCKED at turn-on and does NOT change
  // when other audio starts. This was the "mystery audio" bug (David, Jul 14): the
  // old design followed nowPlaying live, so a background ad/feed video autoplaying
  // mid-call HIJACKED the transmit — telemetry caught it injecting `ad-0ec56a1d…`.
  // To transmit something else, toggle transmit off then on with it playing.
  const [transmitMode, setTransmitMode] = useState(false);
  const [lockedSource, setLockedSource] = useState<typeof nowPlaying>(null);

  const onTransmit = () => {
    void haptic('selection');
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
        });
      } catch {
        // diagnostics unavailable — ignore
      }
    },
    [nowPlaying, canInject, mixerEnabled, transmitMode]
  );

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

    const id = setInterval(() => {
      void (async () => {
        const d = await mixerService.getMixDiagnostics();
        if (!d) return;
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
          if (!firstMismatchReported) {
            firstMismatchReported = true;
            analytics.capture(ANALYTICS_EVENTS.CALL.ENGINE_RATE_MISMATCH, {
              call_sid: sid,
              elapsed_ms: Date.now() - startedAt,
              engines_built_rate: built,
              session_sample_rate: session,
              rendering_format_rate: rendering,
              capturing_format_rate: Number(d.capturingFormatRate ?? 0),
            });
          }
        }
      })();
    }, 1000);

    const stop = setTimeout(() => {
      clearInterval(id);
      if (!engineWasActive) return; // plain call, nothing to report
      analytics.capture(ANALYTICS_EVENTS.CALL.ENGINE_RATE_SUMMARY, {
        call_sid: sid,
        mismatch_samples: mismatchSamples,
        clean: mismatchSamples === 0,
        worst_built_rate: worst?.built ?? null,
        worst_session_rate: worst?.session ?? null,
        worst_rendering_rate: worst?.rendering ?? null,
      });
    }, 12000);

    return () => {
      clearInterval(id);
      clearTimeout(stop);
    };
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
      <HeaderBlur tintRgb="34, 197, 94" fadeExtend={28} />
      <View style={styles.content}>
        <View style={styles.timerContainer}>
          <View style={styles.liveDot} />
          <Text style={styles.timer}>{formatElapsed(elapsed)}</Text>
        </View>

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
        {canInject ? (
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
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
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
