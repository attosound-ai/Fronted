import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSharedValue, useAnimatedReaction, runOnJS } from 'react-native-reanimated';
import { View, StyleSheet, Alert, ActionSheetIOS, Pressable } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { useCallBarVisible, IN_CALL_BAR_HEIGHT } from '@/hooks/useInCallChrome';
import { analytics, ANALYTICS_EVENTS, useFeatureFlag } from '@/lib/analytics';
import { emitTelemetryMarker } from '@/lib/telemetry/callTelemetry';
import { useCallStore } from '@/stores/callStore';
import { haptic } from '@/lib/haptics/hapticService';
import { useRegisterNowPlaying } from '@/lib/callAudio/useRegisterNowPlaying';
import { showNetFailureToast } from '@/components/ui/netToast';
import { Text } from '@/components/ui/Text';
import { Toast, showToast } from '@/components/ui/Toast';
import { AudioPreparingModal } from './AudioPreparingModal';
import { LaneEditSheet } from './LaneEditSheet';
import { useTimeline, clampZoom, ZOOM_MIN, ZOOM_MAX } from '../hooks/useTimeline';
import { useTimelinePlayback } from '../hooks/useTimelinePlayback';
import {
  getAudioInjector,
  AUDIO_INJECTION_FLAG,
} from '@/lib/callAudio/createAudioInjector';
import { useImportAudio } from '../hooks/useImportAudio';
import { useRecordAudio } from '../hooks/useRecordAudio';
import { useTwilioCallRecording } from '../hooks/useTwilioCallRecording';
import { useEngineMixRecording } from '../hooks/useEngineMixRecording';
import { useRangeEffects } from '../hooks/useRangeEffects';
import { RangeEffectsSheet } from '../studio/RangeEffectsSheet';
import { EffectDialog } from '../studio/EffectDialog';
import { RecordSheet } from '../studio/RecordSheet';
import type { EffectDef, EffectValues } from '../studio/effectsCatalog';
import type { RangeOp } from '../../../../modules/atto-audio-transcode';
import type { StopResult } from '../../../../modules/atto-recorder';
import {
  toTelephonyWav,
  isTranscodeAvailable,
  renderSpeech,
  speechVoices,
  musicLibraryStatus,
  requestMusicLibrary,
  pickFromMusicLibrary,
} from '../../../../modules/atto-audio-transcode';
import { useClipPeaks } from '../hooks/useClipPeaks';
import { useOverdubStems } from '../hooks/useOverdubStems';
import { StudioTopBar } from '../studio/StudioTopBar';
import { ClipActionsBar } from '../studio/ClipActionsBar';
import { RangeActionsBar } from '../studio/RangeActionsBar';
import { ZoomRow } from '../studio/ZoomRow';
import { TransportBar } from '../studio/TransportBar';
import { StatusReadout } from '../studio/StatusReadout';
import { TrackPanel } from '../studio/TrackPanel';
import { TimelineSurface } from '../studio/TimelineSurface';
import { CallRecordButton } from '../studio/CallRecordButton';
import { StudioConfigSheet } from '../studio/StudioConfigSheet';
import { MasterEffectsSheet } from '../studio/MasterEffectsSheet';
import { ExporterSheet } from '../studio/ExporterSheet';
import { AutomationPanel, type EnvelopePoint } from '../studio/AutomationPanel';
import { StudioTips, type TipRect } from '../studio/StudioTips';
import { TextToSpeechSheet } from '../studio/TextToSpeechSheet';
import { studioPrefs } from '../studio/studioPrefs';
import type { TipTarget } from '../studio/tipsCatalog';
import { STUDIO, STUDIO_COLORS } from '../studio/studioTheme';
import * as FileSystem from 'expo-file-system/legacy';
import type {
  TimelineViewRef,
  TimelineTapEvent,
  TimelineDoubleTapEvent,
  TimelineSelectionChangeEvent,
  TimelineClipMoveEvent,
  TimelineTrackDragEvent,
  TimelineZoomEvent,
  TimelinePlayheadScrubEvent,
} from '../../../../modules/atto-timeline';

import { serverClipToLocal, clipToInput } from '../types';
import { getTimelineDuration } from '../utils/clipOperations';
import {
  msToPixels,
  formatTimelineMs,
  generateRulerMarks,
} from '../utils/timelineCalculations';
import { projectService } from '@/lib/api/projectService';
import type { LaneMeta, LocalClip, ClipPlacement } from '../types';
import type {
  TimelineClip,
  LaneMetadata,
  ExportResult,
  ExportOptions,
  MasterEffects,
  ProjectSettings,
} from '@/types/project';
import type { AudioSegment } from '@/types/call';
/**
 * Remote KILL-SWITCH for the engine-mixer recording path.
 *
 * The engine path is now the DEFAULT whenever the injection engine is present
 * (audio injection on — the same condition that surfaces the mixer button),
 * because it is what makes the mixer's per-channel config actually apply: it
 * records per channel (mic / remote / app / metronome) with the app/beat channel
 * OFF by default, so a take sung over an injected backing track records DRY and
 * layers cleanly, and the user turns the beat channel on in the mixer when they
 * want the whole blend baked in. The server-side Twilio fork cannot do that — it
 * records the uplink as the far party hears it, backing track baked in.
 *
 * The engine path's trade-off: the take lives on the device until it uploads, so
 * an app kill mid-take loses it (a partial take is still written to disk),
 * whereas the server-side fork survives that. So this flag stays as a fleet-wide
 * escape hatch: set it to FALSE to fall every user back to the Twilio fork
 * instantly if the engine path ever regresses. Absent/true ⇒ engine mix.
 */
export const ENGINE_MIX_RECORDING_FLAG = 'incall_engine_mix_recording';

/**
 * Remote gate for the per-clip EFFECTS feature (Effects button, fx badge and
 * the EffectsSheet). Absent/false = hidden: the feature is built but not yet
 * part of what the client contracted, so it ships dark and is switched on
 * from PostHog when that changes, without a new build. The data model
 * (sourceSegmentId/effects) and the native renderer stay in place either way.
 */
export const CLIP_EFFECTS_FLAG = 'clip_effects_enabled';

interface TimelineEditorProps {
  projectId: string;
  clips: TimelineClip[];
  segments: (AudioSegment & { downloadUrl: string })[];
  lanes?: Record<string, LaneMetadata>;
  /** Editor settings stored on the project (master effects, exporter picks). */
  settings?: ProjectSettings;
  onClose: () => void;
  /** `coverUri` is the local image picked in the exporter, when there is one. */
  onPublish?: (
    result: ExportResult,
    durationMs: number,
    coverUri?: string
  ) => Promise<void>;
  /**
   * Selects which recording flow the toolbar's record button uses.
   * - 'mic' (default): records the device microphone via expo-audio.
   * - 'twilioCall': records both sides of the active Twilio call via
   *   the Media Stream API. Use this when rendering the editor inside
   *   `ActiveCallScreen`.
   */
  recordingMode?: 'mic' | 'twilioCall';
  /** Optional content rendered above the editor's own header — used by
   *  ActiveCallScreen to inject the in-call control bar. */
  topSlot?: React.ReactNode;
}

// The native view takes pixels per second; the reducer keeps its zoom level
// where 1 means 100 px per second (see timelineCalculations).
const PIXELS_PER_SECOND_AT_ZOOM_1 = 100;

/** m:ss for the record button's counter (whole seconds). */
function formatElapsedSeconds(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function TimelineEditor({
  projectId,
  clips: serverClips,
  segments,
  lanes: serverLanes,
  settings: serverSettings,
  onClose,
  onPublish,
  recordingMode = 'mic',
  topSlot,
}: TimelineEditorProps) {
  // When a call is active the global green InCallTopBar floats over this screen;
  // reserve its height so the editor's own header (close/transport) clears it.
  const callBarVisible = useCallBarVisible();
  const insets = useSafeAreaInsets();
  // Live injection state, for the "Transmitting to the call" chip.
  // Engine mode (Sep 15 2026): the timeline's stems play through the native call
  // session; "transmitting" then means the 📡 gate is open WHILE the stems play.
  const engineTimeline = useCallStore((s) => s.playback.engineTimeline);
  const isTransmitting = useCallStore((s) =>
    s.playback.engineTimeline
      ? s.playback.transmit && s.playback.status === 'playing'
      : s.injection?.state === 'playing'
  );
  const initialClips = useMemo(() => serverClips.map(serverClipToLocal), [serverClips]);

  // Local segments state so we can update after import or orphan resolution
  const [localSegments, setLocalSegments] = useState(segments ?? []);
  useEffect(() => {
    if (segments) setLocalSegments(segments);
  }, [segments]);

  // NOTE: A previous version of this file ran an "orphan resolver"
  // here that, for each clip whose segmentId wasn't in `localSegments`,
  // called `projectService.addSegment(projectId, id)`. That endpoint
  // auto-creates a timeline clip on the backend as a side effect — so
  // every cold-start where segments hadn't loaded yet would create
  // duplicate clips (and because the orphan calls ran in parallel,
  // the duplicates all landed at positionInTimeline=0, stacking up
  // on top of each other). It also multiplied on every re-open.
  // The resolver has been removed; the backend now de-dupes
  // addSegment clip creation anyway, but we also don't want to be
  // firing these requests on mount at all. If a clip references a
  // segment we don't have yet, its waveform simply won't render until
  // the segment arrives via the next refetch.

  // Segment duration lookup so each track can compute its waveform trim range
  const segmentDurationMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const seg of localSegments) {
      map.set(seg.id, seg.durationMs);
    }
    return map;
  }, [localSegments]);

  // Convert server lanes (string keys) to numeric keys for timeline state
  const initialLaneMeta = useMemo(() => {
    if (!serverLanes) return undefined;
    const meta: Record<number, LaneMeta> = {};
    for (const [key, val] of Object.entries(serverLanes)) {
      meta[Number(key)] = val;
    }
    return meta;
  }, [serverLanes]);

  const {
    state,
    addClip,
    selectClip,
    setPlaybackPosition,
    setPlaying,
    setZoom,
    undo,
    redo,
    canUndo,
    canRedo,
    markClean,
    setActiveLane,
    addLane,
    moveClipToPosition,
    duplicateClip,
    removeLane,
    setLaneMeta,
    setLaneMute,
    setLaneSolo,
    setLaneGain,
    setLanePan,
    setSelection,
    copyRegion,
    cutRegion,
    silenceRegion,
    pasteRegion,
    canJoinClips,
    joinClips,
    deleteRegion,
    trimToRegion,
    splitRegionToNewLane,
    shiftLane,
    moveLane,
    splitLaneAt,
    replaceClipSource,
  } = useTimeline(initialClips, initialLaneMeta);

  // The clip the edit bar, the effects sheet and Join act on.
  const selectedClip = state.selectedClipId
    ? state.clips.find((c) => c.id === state.selectedClipId)
    : undefined;

  // Memory attribution: bracket the in-call editor so a memory heartbeat between
  // these markers is attributed to the editor. This screen is the prime suspect
  // for the OOM/watchdog kill that drops the client's calls (David, Jul 22:
  // memory 200MB->1.4GB after entering Record Pro during a call). No-op off-call.
  useEffect(() => {
    void emitTelemetryMarker('editor_mount', {
      clip_count: initialClips.length,
      segment_count: (segments ?? []).length,
    });
    return () => {
      void emitTelemetryMarker('editor_unmount');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Transmit a track into a live call (📡) ──
  // The editor plays through expo-audio LOCALLY (Twilio-safe) and, before this,
  // never touched the injection path — so the far party heard NOTHING when the rep
  // played a track, even though reels/audio posts worked (David, Jul 19: "mi madre
  // no escucha las pistas"). Reels work by registering nowPlaying; the editor never
  // did. InjectSource already has kind:'track' (the design intended this) and the
  // native injector already downloads + plays a remote audio URL, so we just wire
  // the currently-focused track (selected clip, else the first) as nowPlaying while
  // in a call. The in-call 📡 button then injects it exactly like a reel.
  const transmitClip = state.selectedClipId
    ? state.clips.find((c) => c.id === state.selectedClipId)
    : state.clips[0];
  const transmitSeg = transmitClip
    ? localSegments.find((s) => s.id === transmitClip.segmentId)
    : undefined;
  const transmitSource = useMemo(
    () =>
      transmitSeg?.downloadUrl
        ? {
            kind: 'track' as const,
            uri: transmitSeg.downloadUrl,
            isVideo: false,
            title: transmitSeg.label ?? 'Track',
            postId: transmitClip?.id,
          }
        : null,
    [transmitSeg?.downloadUrl, transmitSeg?.label, transmitClip?.id]
  );
  // Register while a call bar is up so the 📡 button always has this track to push.
  // Not in engine mode: there the whole timeline IS the session, no single track.
  useRegisterNowPlaying(
    transmitSource,
    callBarVisible && !!transmitSource && !engineTimeline
  );

  // PRE-FETCH the track the instant the editor is up in a call, so the first
  // antenna tap is INSTANT instead of waiting on a download. On poor service that
  // download was the silent stall behind "the satellite button doesn't work
  // instantly" (David, Aug 5): the file now arrives in the background, ahead of
  // the tap. Best-effort and silent; start() still handles + reports a cold miss.
  const prefetchedUriRef = useRef<string | null>(null);
  useEffect(() => {
    // Engine mode prepares the stems itself (useTimelineEnginePlayback claims on
    // open), so the legacy single file prefetch has nothing to warm.
    if (!callBarVisible || !transmitSource?.uri || engineTimeline) return;
    if (prefetchedUriRef.current === transmitSource.uri) return;
    prefetchedUriRef.current = transmitSource.uri;
    void getAudioInjector().prefetch(transmitSource);
  }, [callBarVisible, transmitSource?.uri, engineTimeline]);
  // FULL transmit-source resolution telemetry (David, Jul 26: "import a track then
  // transmit it doesn't work"). Before, we only logged the SUCCESS case, so a
  // failed import→transmit was invisible. Now log the resolution AND the exact
  // reason it's unavailable — the imported clip is usually there but its segment
  // hasn't landed in localSegments yet, or that segment carries no downloadUrl —
  // so we debug with data instead of guessing.
  const transmitReason = !callBarVisible
    ? 'not_in_call'
    : state.clips.length === 0
      ? 'no_clips'
      : !transmitClip
        ? 'no_clip'
        : !transmitSeg
          ? 'segment_not_in_local'
          : !transmitSeg.downloadUrl
            ? 'no_download_url'
            : 'ok';
  const loggedTransmitRef = useRef<string | null>(null);
  useEffect(() => {
    if (!callBarVisible) return;
    const key = `${transmitClip?.id ?? 'none'}:${transmitReason}`;
    if (loggedTransmitRef.current === key) return;
    loggedTransmitRef.current = key;
    analytics.capture(ANALYTICS_EVENTS.CALL.TRACK_TRANSMIT_READY, {
      source_available: !!transmitSource,
      reason: transmitReason,
      clip_count: state.clips.length,
      selected_clip_id: state.selectedClipId ?? null,
      transmit_clip_id: transmitClip?.id ?? null,
      segment_id: transmitClip?.segmentId ?? null,
      segment_found_in_local: !!transmitSeg,
      has_download_url: !!transmitSeg?.downloadUrl,
      local_segment_count: localSegments.length,
    });
    // transmitReason already encodes clip/segment/url state; keep deps tight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callBarVisible, transmitReason, transmitClip?.id]);

  // While the rep transmits a track into the call (📡), stop the editor's LOCAL
  // playback. The loudspeaker copy plays OUTSIDE the call's echo canceller, so the
  // mic would send the mother a second, offset copy on top of the injected one —
  // the same doubling reels avoid by muting their player during injection. The rep
  // still hears the track through the injector's echo-cancelled monitor.
  const isInjecting = useCallStore(
    (s) => s.injection?.state === 'playing' || s.injection?.state === 'preparing'
  );
  useEffect(() => {
    // Engine mode: local playback IS the transmission (one source, gated), so
    // nothing pauses anything. Fallback path only.
    if (engineTimeline) return;
    if (isInjecting && state.isPlaying) {
      setPlaying(false);
    }
    // Only react to the inject transition; using the live isPlaying here would
    // re-pause the user every render while injecting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInjecting]);

  // Detect the transmit source swapping WHILE an injection is live. Finishing an
  // in-call recording makes the new take the focused clip, which silently swaps
  // the registered source out from under the running injection — the injector
  // keeps playing the OLD file, so the far party stops hearing what the UI
  // implies (David, Aug 2: after recording, "ella no lo escuchaba").
  const injectingSourceUriRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isInjecting) {
      injectingSourceUriRef.current = null;
      return;
    }
    const uri = transmitSource?.uri ?? null;
    if (injectingSourceUriRef.current === null) {
      injectingSourceUriRef.current = uri;
      return;
    }
    if (injectingSourceUriRef.current === uri) return;
    const from = injectingSourceUriRef.current;
    injectingSourceUriRef.current = uri;
    analytics.capture(ANALYTICS_EVENTS.CALL.TRANSMIT_SOURCE_SWAPPED, {
      from_uri: from,
      to_uri: uri,
      to_clip_id: transmitClip?.id ?? null,
      reason: transmitReason,
      // True = the engine is still transmitting the previous file.
      still_injecting: true,
    });
  }, [isInjecting, transmitSource?.uri, transmitClip?.id, transmitReason]);

  const { t } = useTranslation('projects');
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // Insert and Replace land the imported clip at the line or over the range;
  // the placement is read by this indirection (declared below the hooks).
  const addClipPlacedRef = useRef<(clip: LocalClip) => void>(() => {});
  const {
    importAudio: rawImportAudio,
    isImporting,
    cancelImport,
    progress: importProgress,
  } = useImportAudio({
    projectId,
    activeLaneIndex: state.activeLaneIndex,
    addClip: (clip) => addClipPlacedRef.current(clip),
  });

  // Wrap import to also refresh segments (useImportAudio only adds the clip)
  const importAudio = useCallback(
    async (source: 'audio' | 'video' = 'audio') => {
      await rawImportAudio(source);
      try {
        const fresh = await projectService.getProject(projectId);
        setLocalSegments((prev) => {
          const freshIds = new Set(fresh.segments.map((s) => s.id));
          const kept = prev.filter((s) => !freshIds.has(s.id));
          return [...kept, ...fresh.segments];
        });
      } catch {
        // best-effort
      }
    },
    [rawImportAudio, projectId]
  );

  // Recording → upload → new clip on the active lane. Both hooks are
  // instantiated unconditionally to satisfy rules-of-hooks; the inactive
  // one is a no-op until its `startRecording` is called, so the
  // resource cost is negligible. The caller picks which one drives the
  // toolbar via the `recordingMode` prop.
  // Snapshot where the live recording starts on the timeline (the playhead at
  // record time). Declared before the recording hooks because the Twilio hook
  // reads it at STOP time to tell the backend where to place the clip.
  const recordingStartMsRef = useRef(0);
  const recordingLaneRef = useRef(0);

  const micRecording = useRecordAudio({
    projectId,
    activeLaneIndex: state.activeLaneIndex,
    addClip,
  });
  const twilioRecording = useTwilioCallRecording({
    projectId,
    activeLaneIndex: state.activeLaneIndex,
    addClip,
    getRecordStartMs: () => recordingStartMsRef.current,
  });
  // Engine-mixer recording: per-channel arm + gain, app audio off by default, so
  // a take sung over an injected backing track does NOT contain that track and
  // layers cleanly. Instantiated unconditionally (rules of hooks); inert until
  // its startRecording is called.
  const engineMixRecording = useEngineMixRecording({
    projectId,
    activeLaneIndex: state.activeLaneIndex,
    addClip,
    getRecordStartMs: () => recordingStartMsRef.current,
  });
  // Engine-mix is the DEFAULT in-call recording path whenever the injection engine
  // is present (audio injection on — the same condition that shows the mixer
  // button), so the mixer's per-channel config actually drives the take (beat/app
  // channel OFF by default ⇒ a clean overdub the rep layers over the beat already
  // in the timeline). Without the injection engine the custom device is not
  // Twilio's active device, so we MUST stay on the server-side Twilio fork or
  // recording would fail — that keeps recording working for non-injection users.
  // ENGINE_MIX_RECORDING_FLAG is a kill-switch: set it false to force everyone back
  // to the Twilio fork.
  const injectionEnginePresent = useFeatureFlag(AUDIO_INJECTION_FLAG) === true;
  const engineMixKilled = useFeatureFlag(ENGINE_MIX_RECORDING_FLAG) === false;
  const useEngineMix = injectionEnginePresent && !engineMixKilled;
  const {
    startRecording: rawStartRecording,
    stopRecording: rawStopRecording,
    isRecording,
    isUploading: isUploadingRecording,
    elapsed: recordingElapsed,
    elapsedMs: recordingElapsedMs,
  } = recordingMode === 'twilioCall'
    ? useEngineMix
      ? engineMixRecording
      : twilioRecording
    : micRecording;

  const startRecording = useCallback(async () => {
    // Record AT THE PLAYHEAD — the position the user is listening at — not
    // appended after the last clip on the lane. Appending is what made a take
    // sung over an imported track land detached at the end of the timeline, so
    // the waveform you heard and the waveform you recorded were nowhere near
    // each other (David, Aug 2: "la pista de grabación se pone al final... uno
    // confunde bastante las cosas"). Overdubbing at the playhead is what a
    // multitrack editor is for; overlap on the same lane is the user's call.
    // The position is also sent to the backend at stop (addSegment), because the
    // backend is what authoritatively places the clip.
    // Engine mode: the reducer position is committed at 5 Hz; the session's own
    // clock (last tick + elapsed, capped) places the take within a frame or two.
    const pb = useCallStore.getState().playback;
    recordingStartMsRef.current =
      pb.engineTimeline && pb.status === 'playing'
        ? Math.max(0, pb.positionMs + Math.min(500, Math.max(0, Date.now() - pb.tickAt)))
        : Math.max(0, state.playbackPositionMs);
    // AUTO-TARGET A FREE LANE. Recording onto the active lane put the take ON
    // TOP of the beat clip already there (David, Aug 30: "en vez de crear una
    // nueva pista lo puso encima"). Overdub semantics: if the active lane has a
    // clip under the playhead, record onto the first lane that is FREE at the
    // playhead; if none exists, create one. The user can still drag the clip
    // afterwards; this only picks a sane default.
    const at = recordingStartMsRef.current;
    const laneBusyAt = (laneIndex: number) =>
      state.clips.some((c) => {
        if (c.laneIndex !== laneIndex) return false;
        const start = c.positionInTimeline;
        const end = start + (c.endInSegment - c.startInSegment);
        return at >= start && at < end;
      });
    let targetLane = state.activeLaneIndex;
    let autoSwitched = false;
    if (laneBusyAt(targetLane)) {
      autoSwitched = true;
      let free = -1;
      for (let i = 0; i < state.laneCount; i++) {
        if (!laneBusyAt(i)) {
          free = i;
          break;
        }
      }
      if (free >= 0) {
        targetLane = free;
        setActiveLane(free);
      } else {
        targetLane = state.laneCount;
        addLane();
        setActiveLane(targetLane);
      }
    }
    recordingLaneRef.current = targetLane;
    analytics.capture(ANALYTICS_EVENTS.CALL.RECORDING_PLACED, {
      phase: 'start',
      playhead_ms: Math.round(state.playbackPositionMs),
      auto_lane_switched: autoSwitched,
      lane_index: targetLane,
      clip_count: state.clips.length,
      lane_clip_count: state.clips.filter((c) => c.laneIndex === state.activeLaneIndex)
        .length,
    });
    await rawStartRecording();
  }, [state.clips, state.activeLaneIndex, state.playbackPositionMs, rawStartRecording]);

  const stopRecording = useCallback(async () => {
    await rawStopRecording();
    try {
      const fresh = await projectService.getProject(projectId);
      setLocalSegments((prev) => {
        const freshIds = new Set(fresh.segments.map((s) => s.id));
        const kept = prev.filter((s) => !freshIds.has(s.id));
        return [...kept, ...fresh.segments];
      });
    } catch {
      // best-effort
    }
  }, [rawStopRecording, projectId]);

  // UI-thread playhead position. The play loop writes it every frame; the
  // playhead + time readout animate off it with no React re-render. Reducer
  // state (state.playbackPositionMs) is committed at a low rate for autosave /
  // record-at-playhead only. See useTimelinePlayback.
  const positionSv = useSharedValue(state.playbackPositionMs);

  useTimelinePlayback({
    clips: state.clips,
    segments: localSegments,
    playbackPositionMs: state.playbackPositionMs,
    isPlaying: state.isPlaying,
    laneMeta: state.laneMeta,
    onPositionChange: setPlaybackPosition,
    onPlayingChange: setPlaying,
    positionSv,
  });

  const totalDuration = getTimelineDuration(state.clips);
  const totalWidth = msToPixels(totalDuration + 5000, state.zoomLevel);

  // ── Editor scale telemetry ──
  // The mounted timeline's native-view count is the freeze risk: Fabric commits
  // mount/unmount as ONE synchronous main-thread transaction, and the Aug 3
  // stuck-on-delete hang (REACT-NATIVE-3W: a 25-min clip = ~50k bar views) had
  // no telemetry saying how big the tree was. `est_bar_views` mirrors
  // WaveformView's own math (3 px per bar, capped at its MAX_BARS=512), so if
  // either side of that math changes, change both.
  const editorScale = useCallback(() => {
    let estBarViews = 0;
    for (const c of state.clips) {
      const w = msToPixels(c.endInSegment - c.startInSegment, state.zoomLevel);
      estBarViews += Math.min(Math.max(1, Math.floor(w / 3)), 512);
    }
    return {
      clip_count: state.clips.length,
      lane_count: state.laneCount,
      total_duration_ms: totalDuration,
      content_width_px: Math.round(totalWidth),
      zoom_level: state.zoomLevel,
      est_bar_views: estBarViews,
      ruler_marks: generateRulerMarks(totalDuration + 5000, state.zoomLevel).length,
    };
  }, [state.clips, state.laneCount, state.zoomLevel, totalDuration, totalWidth]);
  const editorScaleRef = useRef(editorScale);
  editorScaleRef.current = editorScale;

  useEffect(() => {
    // Once per editor mount, after the initial clips have loaded. A 300ms
    // debounce lets the server timeline hydrate so we report the real tree,
    // not the empty shell.
    const timer = setTimeout(() => {
      analytics.capture(ANALYTICS_EVENTS.PROJECT.TIMELINE_SCALE, {
        trigger: 'mount',
        project_id: projectId,
        ...editorScaleRef.current(),
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [projectId]);

  // Zoom is committed to the reducer once per gesture or button press; the
  // native view applies its own preview while pinching.
  const commitZoom = useCallback(
    (level: number) => {
      // SoundLab's "Keep Playing on Zoom": off means a zoom stops playback.
      if (!studioPrefs.keepPlayingOnZoom()) setPlaying(false);
      setZoom(clampZoom(level));
    },
    [setZoom, setPlaying]
  );

  const handleSeek = useCallback(
    (positionMs: number) => {
      setPlaying(false);
      setPlaybackPosition(positionMs);
    },
    [setPlaying, setPlaybackPosition]
  );

  const handlePlayPause = useCallback(() => {
    if (state.isPlaying) {
      setPlaying(false);
    } else {
      // ONE audio at a time. Transmitting a track pauses local playback and the
      // engine's monitor takes over as what the user hears (anti-echo, b114).
      // Un-pausing the timeline on top of that live monitor played BOTH copies
      // at once (David, Aug 3: "si lo despauso suena doble"). Local play is an
      // explicit takeover: stop the injection, then play locally.
      // Engine mode (Sep 15 2026): Play never stops the transmission. The stems
      // are the one source; the 📡 gate alone decides whether the far party
      // hears them. The takeover below is the fallback path only.
      const callState = useCallStore.getState();
      const injection = callState.injection;
      if (
        !callState.playback.engineTimeline &&
        (injection?.state === 'playing' || injection?.state === 'preparing')
      ) {
        void getAudioInjector().stop('user_stopped');
      }
      if (state.playbackPositionMs >= totalDuration && totalDuration > 0) {
        setPlaybackPosition(0);
      }
      setPlaying(true);
    }
  }, [
    state.isPlaying,
    state.playbackPositionMs,
    totalDuration,
    setPlaying,
    setPlaybackPosition,
  ]);

  // Autosave: debounced 2s after any edit.
  // Refs track current state so we can detect if edits happened during save.
  const savingRef = useRef(false);
  const currentClipsRef = useRef(state.clips);
  currentClipsRef.current = state.clips;
  const currentLaneMetaRef = useRef(state.laneMeta);
  currentLaneMetaRef.current = state.laneMeta;
  // So a failing autosave notifies once per streak, not on every 2s retry.
  const autosaveFailedNotifiedRef = useRef(false);

  useEffect(() => {
    if (!state.isDirty || isSaving) return;
    const clipsSnapshot = state.clips;
    const lanesSnapshot = state.laneMeta;
    const timer = setTimeout(async () => {
      if (savingRef.current) return;
      savingRef.current = true;
      setIsSaving(true);
      try {
        const lanesPayload: Record<string, LaneMetadata> = {};
        for (const [key, val] of Object.entries(lanesSnapshot)) {
          lanesPayload[String(key)] = val;
        }
        await Promise.all([
          projectService.saveTimeline(projectId, clipsSnapshot.map(clipToInput)),
          projectService.updateProject(projectId, { lanes: lanesPayload }),
        ]);
        // Only mark clean if state hasn't changed during the async save
        if (
          currentClipsRef.current === clipsSnapshot &&
          currentLaneMetaRef.current === lanesSnapshot
        ) {
          markClean();
        }
        // Recovered: allow the next failure streak to notify again.
        autosaveFailedNotifiedRef.current = false;
      } catch (error: unknown) {
        // This effect already retries every ~2s while isDirty stays true (the
        // isSaving dep re-runs it), so the save self-heals when signal returns.
        // Notify ONCE per failure streak instead of on every retry, and make the
        // message network-aware so a weak-signal user knows the edit is not lost.
        if (!autosaveFailedNotifiedRef.current) {
          autosaveFailedNotifiedRef.current = true;
          void showNetFailureToast(
            error,
            t('common:net.actions.saving', { defaultValue: 'Saving' })
          );
        }
      } finally {
        savingRef.current = false;
        setIsSaving(false);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [state.isDirty, state.clips, state.laneMeta, projectId, markClean, isSaving]);

  const flushSave = useCallback(async () => {
    // Wait for any in-flight autosave to finish before flushing
    let waitAttempts = 0;
    while (savingRef.current && waitAttempts < 30) {
      await new Promise((r) => setTimeout(r, 100));
      waitAttempts++;
    }
    savingRef.current = true;
    setIsSaving(true);
    try {
      const lanesPayload: Record<string, LaneMetadata> = {};
      for (const [key, val] of Object.entries(state.laneMeta)) {
        lanesPayload[String(key)] = val;
      }
      await Promise.all([
        projectService.saveTimeline(projectId, state.clips.map(clipToInput)),
        projectService.updateProject(projectId, { lanes: lanesPayload }),
      ]);
      markClean();
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [projectId, state.clips, state.laneMeta, state.isDirty, markClean]);

  // Lane gain slider: apply to the preview as before, and on release record the
  // committed value so a "posted louder than the preview" report has the
  // intent on file (diffed against backend_project_export_mix).
  const commitLaneGain = useCallback(
    (laneIndex: number, gainDb: number, commit: boolean) => {
      setLaneGain(laneIndex, gainDb, { commit });
      if (commit) {
        analytics.capture(ANALYTICS_EVENTS.PROJECT.LANE_GAIN_SET, {
          project_id: projectId,
          lane_index: laneIndex,
          gain_db: gainDb,
        });
      }
    },
    [projectId, setLaneGain]
  );

  // The cover travels twice: uploaded it is embedded in the exported file,
  // and the local image goes to the composer so the post can carry it.
  const pendingCoverRef = useRef<string | null>(null);
  const handleExport = useCallback(
    async (exportOptions?: ExportOptions) => {
      if (state.clips.length === 0) {
        showToast(t('timeline.errorNoClipsToExport'));
        return;
      }

      const timelineDurationMs = getTimelineDuration(state.clips);
      const t0 = Date.now();
      // Drive the loading state across the WHOLE flow (save → backend mix →
      // onPublish), not just onPublish. Before this the button showed no spinner
      // during the slow backend export, so "Publicar" felt frozen (David, Jul 20).
      setIsPublishing(true);
      // Phase accumulators so the terminal event reports where the time went even
      // when a later phase throws.
      let saveMs = 0;
      let exportMs = 0;
      let publishMs = 0;
      let fileSizeBytes: number | null = null;
      // A "started" marker so a hang (no terminal event) is still visible.
      analytics.capture(ANALYTICS_EVENTS.PROJECT.EXPORTED, {
        outcome: 'started',
        clip_count: state.clips.length,
        timeline_duration_ms: timelineDurationMs,
      });
      try {
        const tSave = Date.now();
        await flushSave();
        saveMs = Date.now() - tSave;

        // What the user asked the mix to be, captured AFTER the save so it is
        // exactly what the backend reads. Diff against backend_project_export_mix.
        const lanesSnapshot = Object.entries(state.laneMeta).map(([idx, meta]) => ({
          lane_index: Number(idx),
          gain_db: meta?.gainDb ?? 0,
          muted: meta?.muted === true,
          solo: meta?.solo === true,
          clip_count: state.clips.filter((c) => c.laneIndex === Number(idx)).length,
        }));
        const clipVolumes = state.clips.map((c) => c.volume ?? 1);
        analytics.capture(ANALYTICS_EVENTS.PROJECT.EXPORT_MIX_SNAPSHOT, {
          project_id: projectId,
          clip_count: state.clips.length,
          lanes: lanesSnapshot,
          any_solo: lanesSnapshot.some((l) => l.solo),
          lanes_with_gain: lanesSnapshot.filter((l) => l.gain_db !== 0).length,
          clips_non_unity_volume: clipVolumes.filter((v) => v !== 1).length,
          clip_volume_min: clipVolumes.length ? Math.min(...clipVolumes) : null,
          clip_volume_max: clipVolumes.length ? Math.max(...clipVolumes) : null,
          save_ms: saveMs,
        });

        const tExport = Date.now();
        const result = await projectService.exportProject(projectId, exportOptions);
        exportMs = Date.now() - tExport;
        fileSizeBytes = result.fileSizeBytes ?? null;

        if (onPublish) {
          const tPublish = Date.now();
          await onPublish(
            result,
            timelineDurationMs,
            pendingCoverRef.current ?? undefined
          );
          publishMs = Date.now() - tPublish;
        } else {
          Alert.alert(
            t('timeline.exportCompleteTitle'),
            t('timeline.exportCompleteMessage', {
              size: Math.round(result.fileSizeBytes / 1024),
            }),
            [{ text: t('timeline.exportCompleteOk') }]
          );
        }

        analytics.capture(ANALYTICS_EVENTS.PROJECT.EXPORTED, {
          outcome: 'succeeded',
          clip_count: state.clips.length,
          timeline_duration_ms: timelineDurationMs,
          save_ms: saveMs,
          export_ms: exportMs,
          publish_ms: publishMs,
          total_ms: Date.now() - t0,
          file_size_bytes: fileSizeBytes,
        });
      } catch (error: unknown) {
        analytics.capture(ANALYTICS_EVENTS.PROJECT.EXPORTED, {
          outcome: 'failed',
          clip_count: state.clips.length,
          timeline_duration_ms: timelineDurationMs,
          save_ms: saveMs,
          export_ms: exportMs,
          publish_ms: publishMs,
          total_ms: Date.now() - t0,
          file_size_bytes: fileSizeBytes,
          error: error instanceof Error ? error.message : String(error),
        });
        showToast(t('timeline.errorExportFailed'));
      } finally {
        setIsPublishing(false);
      }
    },
    [projectId, state.clips, state.laneMeta, flushSave, onPublish, t]
  );

  // ── Master effects and the exporter ──
  // Both live on the project's `settings`, so the backend mix applies exactly
  // what the editor previewed. Saving is debounced through the same patch
  // call the lane metadata uses.
  const [masterSheetVisible, setMasterSheetVisible] = useState(false);
  const [exporterVisible, setExporterVisible] = useState(false);
  const [settings, setSettings] = useState<ProjectSettings>(serverSettings ?? {});
  useEffect(() => {
    if (serverSettings) setSettings(serverSettings);
  }, [serverSettings]);
  const saveSettings = useCallback(
    async (next: ProjectSettings) => {
      setSettings(next);
      try {
        await projectService.updateProject(projectId, { settings: next });
      } catch {
        // Best effort: the values stay in the session and retry on the next change.
      }
    },
    [projectId]
  );
  const handleMasterChange = useCallback(
    (master: MasterEffects, commit: boolean) => {
      const next = { ...settings, master };
      if (!commit) {
        setSettings(next);
        return;
      }
      void saveSettings(next);
      analytics.capture(ANALYTICS_EVENTS.PROJECT.MASTER_EFFECTS_SET, {
        project_id: projectId,
        pitch_semitones: master.pitchSemitones ?? 0,
        tempo_rate: master.tempoRate ?? 1,
        reverb_mix: master.reverb?.wetDryMix ?? 0,
        eq_bands_set: (master.eqGainsDb ?? []).filter((g) => Math.abs(g) > 0.05).length,
      });
    },
    [settings, saveSettings, projectId]
  );
  const handlePickCover = useCallback(
    async (uri: string, mimeType: 'image/jpeg' | 'image/png') => {
      try {
        const { coverKey } = await projectService.uploadCover(projectId, uri, mimeType);
        return coverKey;
      } catch {
        showToast(t('timeline.errorExportFailed'));
        return null;
      }
    },
    [projectId, t]
  );
  const handleMixdown = useCallback(
    (options: ExportOptions, coverUri: string | null) => {
      setSettings((prev) => ({ ...prev, exportPrefs: options }));
      pendingCoverRef.current = coverUri;
      setExporterVisible(false);
      void handleExport(options);
    },
    [handleExport]
  );

  // SoundLab asks on close: Save, Discard or Cancel. Our editor autosaves as
  // you work, so Discard means putting the project back exactly as it was when
  // this session opened, which is what the person expects that word to do.
  const openingSnapshotRef = useRef<{
    clips: LocalClip[];
    laneMeta: Record<number, LaneMeta>;
  } | null>(null);
  if (openingSnapshotRef.current === null && initialClips.length >= 0) {
    openingSnapshotRef.current = { clips: initialClips, laneMeta: initialLaneMeta ?? {} };
  }
  const closeNow = useCallback(async () => {
    if (state.isDirty) {
      try {
        await flushSave();
      } catch {
        // Best effort save before closing.
      }
    }
    await onClose();
  }, [state.isDirty, flushSave, onClose]);
  const discardAndClose = useCallback(async () => {
    const snapshot = openingSnapshotRef.current;
    analytics.capture(ANALYTICS_EVENTS.PROJECT.EDITOR_CLOSED, {
      project_id: projectId,
      action: 'discard',
      clip_count: state.clips.length,
    });
    if (snapshot) {
      try {
        await projectService.saveTimeline(projectId, snapshot.clips.map(clipToInput));
        await projectService.updateProject(projectId, {
          lanes: Object.fromEntries(
            Object.entries(snapshot.laneMeta).map(([k, v]) => [String(k), v])
          ) as Record<string, LaneMetadata>,
        });
      } catch {
        showToast(t('timeline.errorExportFailed'));
      }
    }
    await onClose();
  }, [projectId, state.clips.length, onClose, t]);
  const handleClose = useCallback(() => {
    if (!state.isDirty && !openingSnapshotRef.current) {
      void closeNow();
      return;
    }
    Alert.alert(t('studio.close.title'), t('studio.close.body'), [
      { text: t('studio.close.cancel'), style: 'cancel' },
      {
        text: t('studio.close.discard'),
        style: 'destructive',
        onPress: () => void discardAndClose(),
      },
      {
        text: t('studio.close.save'),
        onPress: () => {
          analytics.capture(ANALYTICS_EVENTS.PROJECT.EDITOR_CLOSED, {
            project_id: projectId,
            action: 'save',
            clip_count: state.clips.length,
          });
          void closeNow();
        },
      },
    ]);
  }, [state.isDirty, state.clips.length, closeNow, discardAndClose, projectId, t]);

  const handleRemoveLane = useCallback(
    (laneIndex: number) => {
      if (state.laneCount <= 1) return;
      const hasClips = state.clips.some((c) => c.laneIndex === laneIndex);
      if (!hasClips) {
        removeLane(laneIndex);
        return;
      }
      const name =
        state.laneMeta[laneIndex]?.name ||
        t('studio.trackDefaultName', { n: laneIndex + 1 });
      Alert.alert(t('studio.removeTrackConfirm', { name }), t('studio.removeTrackBody'), [
        { text: t('common:cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('studio.removeTrack'),
          style: 'destructive',
          onPress: () => removeLane(laneIndex),
        },
      ]);
    },
    [state.clips, state.laneCount, state.laneMeta, removeLane, t]
  );

  const laneName = useCallback(
    (laneIndex: number) =>
      state.laneMeta[laneIndex]?.name ||
      t('studio.trackDefaultName', { n: laneIndex + 1 }),
    [state.laneMeta, t]
  );

  // Caption for the toolbar's edit bar: the selected clip's lane name (or
  // its default "Lane N") and the clip's trimmed length, e.g. "Vocals · 00:12".
  // ── Range effects ──
  // A render lands as a NEW segment; register it locally so playback and
  // the waveform resolve it before the next project refetch replaces it.
  const [effectsSheetVisible, setEffectsSheetVisible] = useState(false);
  const [activeEffect, setActiveEffect] = useState<EffectDef | null>(null);
  const addLocalSegment = useCallback(
    (segment: AudioSegment & { downloadUrl: string }) =>
      setLocalSegments((prev) => [...prev, segment]),
    []
  );
  const rangeEffects = useRangeEffects({
    projectId,
    segments: localSegments,
    addSegment: addLocalSegment,
    replaceClipSource,
  });
  const handlePickEffect = useCallback(
    (def: EffectDef) => {
      if (def.kind === 'ai') {
        showToast(t('studio.effects.aiSoon'));
        return;
      }
      setEffectsSheetVisible(false);
      // Let the sheet slide away before the dialog fades in.
      setTimeout(() => setActiveEffect(def), 250);
    },
    [t]
  );
  const buildOp = useCallback(
    (values: EffectValues): RangeOp | null =>
      activeEffect ? (activeEffect.buildOp(values) as RangeOp | null) : null,
    [activeEffect]
  );
  const handlePreviewEffect = useCallback(
    (values: EffectValues) => {
      const op = buildOp(values);
      if (!op || !state.selection) return;
      void rangeEffects.preview(state.clips, state.selection, op);
    },
    [buildOp, state.selection, state.clips, rangeEffects]
  );
  const handleApplyEffect = useCallback(
    async (values: EffectValues) => {
      const op = buildOp(values);
      if (!op || !state.selection) return;
      // The hook reports every phase to telemetry and surfaces a failure in
      // `lastError`, which the dialog shows: a toast would be hidden behind it.
      const ok = await rangeEffects.apply(state.clips, state.selection, op);
      if (ok) setActiveEffect(null);
    },
    [buildOp, state.selection, state.clips, rangeEffects]
  );
  const handleCancelEffect = useCallback(() => {
    rangeEffects.stopPreview();
    setActiveEffect(null);
  }, [rangeEffects]);

  // ── Join ──
  // Heals the selected clip with its nearest neighbor on the lane when the
  // reducer says they are contiguous (same source, touching). The right
  // neighbor is tried first, then the left; the pair is kept in time order.
  const joinPair = useMemo<[string, string] | null>(() => {
    if (!selectedClip) return null;
    const selStart = selectedClip.positionInTimeline;
    const selEnd = selStart + (selectedClip.endInSegment - selectedClip.startInSegment);
    let right: LocalClip | undefined;
    let left: LocalClip | undefined;
    let rightGap = Infinity;
    let leftGap = Infinity;
    for (const c of state.clips) {
      if (c.laneIndex !== selectedClip.laneIndex || c.id === selectedClip.id) continue;
      const cStart = c.positionInTimeline;
      const cEnd = cStart + (c.endInSegment - c.startInSegment);
      if (cStart >= selEnd - 1 && cStart - selEnd < rightGap) {
        right = c;
        rightGap = cStart - selEnd;
      }
      if (cEnd <= selStart + 1 && selStart - cEnd < leftGap) {
        left = c;
        leftGap = selStart - cEnd;
      }
    }
    if (right && canJoinClips(selectedClip.id, right.id))
      return [selectedClip.id, right.id];
    if (left && canJoinClips(left.id, selectedClip.id)) return [left.id, selectedClip.id];
    return null;
  }, [selectedClip, state.clips, canJoinClips]);
  const handleJoin = useCallback(() => {
    if (!joinPair) return;
    joinClips(joinPair[0], joinPair[1]);
  }, [joinPair, joinClips]);

  // ── SoundLab selection semantics on the native timeline ──
  // A tap places the orange selection line and the playhead together and
  // picks the clip under it; dragging from the line draws a range; a double
  // tap selects the whole clip (or the whole lane); tapping empty space
  // clears everything. There is no Select mode: the native view decides
  // which gesture the touch is and reports it.
  const [selectionLineMs, setSelectionLineMs] = useState<number | null>(null);
  const [loopActive, setLoopActive] = useState(false);
  const [automationActive, setAutomationActive] = useState(false);
  const [panelsCollapsed, setPanelsCollapsed] = useState(false);
  const [configVisible, setConfigVisible] = useState(false);
  // Preferences read once per change, so the editor reacts without a remount.
  const [prefsVersion, setPrefsVersion] = useState(0);
  const prefs = useMemo(
    () => ({
      showTrackIndex: studioPrefs.showTrackIndex(),
      keepPlayingOnZoom: studioPrefs.keepPlayingOnZoom(),
      reduceAnimation: studioPrefs.reduceAnimation(),
      timelineMarker: studioPrefs.timelineMarker(),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prefsVersion]
  );
  const timelineRef = useRef<TimelineViewRef>(null);
  const laneCountRef = useRef(state.laneCount);
  laneCountRef.current = state.laneCount;

  const handleTimelineTap = useCallback(
    (e: { nativeEvent: TimelineTapEvent }) => {
      const { trackIndex, ms, clipId } = e.nativeEvent;
      const at = Math.max(0, Math.round(ms));
      setSelectionLineMs(at);
      // Seek without stopping: a tap while playing just jumps the playhead.
      if (state.isPlaying) {
        setPlaying(false);
        setPlaybackPosition(at);
        setTimeout(() => setPlaying(true), 0);
      } else {
        setPlaybackPosition(at);
      }
      selectClip(clipId ?? null);
      setActiveLane(Math.max(0, Math.min(laneCountRef.current - 1, trackIndex)));
      void haptic('selection');
    },
    [state.isPlaying, setPlaying, setPlaybackPosition, selectClip, setActiveLane]
  );

  const handleTimelineDoubleTap = useCallback(
    (e: { nativeEvent: TimelineDoubleTapEvent }) => {
      const { trackIndex, clipId } = e.nativeEvent;
      const lane = Math.max(0, Math.min(laneCountRef.current - 1, trackIndex));
      const clip = clipId ? state.clips.find((c) => c.id === clipId) : undefined;
      if (clip) {
        setSelection({
          laneIndex: lane,
          startMs: clip.positionInTimeline,
          endMs: clip.positionInTimeline + (clip.endInSegment - clip.startInSegment),
        });
      } else {
        const laneEnd = state.clips
          .filter((c) => c.laneIndex === lane)
          .reduce(
            (m, c) =>
              Math.max(m, c.positionInTimeline + (c.endInSegment - c.startInSegment)),
            0
          );
        if (laneEnd > 0) setSelection({ laneIndex: lane, startMs: 0, endMs: laneEnd });
      }
      void haptic('medium');
    },
    [state.clips, setSelection]
  );

  const handleSelectionChange = useCallback(
    (e: { nativeEvent: TimelineSelectionChangeEvent }) => {
      const { trackIndex, startMs, endMs, phase } = e.nativeEvent;
      const lane = Math.max(0, Math.min(laneCountRef.current - 1, trackIndex));
      const start = Math.max(0, Math.round(Math.min(startMs, endMs)));
      const end = Math.max(0, Math.round(Math.max(startMs, endMs)));
      if (phase === 'begin') void haptic('selection');
      if (phase === 'end' && end - start < 1) {
        setSelection(null);
        return;
      }
      setSelection({ laneIndex: lane, startMs: start, endMs: end });
    },
    [setSelection]
  );

  const handleClipMove = useCallback(
    (e: { nativeEvent: TimelineClipMoveEvent }) => {
      const { clipId, startMs, phase } = e.nativeEvent;
      if (phase === 'begin') void haptic('medium');
      if (phase !== 'end') return;
      moveClipToPosition(clipId, Math.max(0, Math.round(startMs)));
    },
    [moveClipToPosition]
  );

  const handleTrackDrag = useCallback(
    (e: { nativeEvent: TimelineTrackDragEvent }) => {
      const { trackIndex, deltaMs, phase } = e.nativeEvent;
      if (phase !== 'end') return;
      const lane = Math.max(0, Math.min(laneCountRef.current - 1, trackIndex));
      if (Math.abs(deltaMs) < 1) return;
      shiftLane(lane, Math.round(deltaMs));
    },
    [shiftLane]
  );

  const handleZoomEvent = useCallback(
    (e: { nativeEvent: TimelineZoomEvent }) => {
      if (e.nativeEvent.phase !== 'end') return;
      commitZoom(e.nativeEvent.pixelsPerSecond / PIXELS_PER_SECOND_AT_ZOOM_1);
    },
    [commitZoom]
  );

  const handlePlayheadScrub = useCallback(
    (e: { nativeEvent: TimelinePlayheadScrubEvent }) => {
      const at = Math.max(0, Math.round(e.nativeEvent.ms));
      positionSv.value = at;
      if (e.nativeEvent.phase === 'end') {
        handleSeek(at);
        setSelectionLineMs(at);
      }
    },
    [positionSv, handleSeek]
  );

  // Zoom buttons step by the same factor SoundLab's do (about 1.5x).
  const zoomIn = useCallback(
    () => commitZoom(state.zoomLevel * 1.5),
    [commitZoom, state.zoomLevel]
  );
  const zoomOut = useCallback(
    () => commitZoom(state.zoomLevel / 1.5),
    [commitZoom, state.zoomLevel]
  );

  // ── Loop ──
  // Loop plays the selected range on repeat; without a range it loops the
  // whole timeline. The playhead is watched on the UI thread and the jump
  // back is one pause, seek, play cycle on JS.
  const loopRef = useRef({ active: false, start: 0, end: 0 });
  loopRef.current = {
    active: loopActive && state.isPlaying,
    start: state.selection ? state.selection.startMs : 0,
    end: state.selection ? state.selection.endMs : totalDuration,
  };
  const loopBack = useCallback(() => {
    const { active, start } = loopRef.current;
    if (!active) return;
    setPlaying(false);
    setPlaybackPosition(start);
    setTimeout(() => setPlaying(true), 0);
  }, [setPlaying, setPlaybackPosition]);
  const loopEndSv = useSharedValue(0);
  loopEndSv.value = loopRef.current.active
    ? loopRef.current.end
    : Number.MAX_SAFE_INTEGER;
  useAnimatedReaction(
    () => positionSv.value >= loopEndSv.value,
    (hit, prev) => {
      if (hit && !prev) runOnJS(loopBack)();
    },
    [loopBack]
  );
  const toggleLoop = useCallback(() => {
    setLoopActive((v) => !v);
    if (!loopActive && !state.selection) showToast(t('studio.loopHint'));
  }, [loopActive, state.selection, t]);

  // ── Clip actions (second row) ──
  const region = state.selection;
  const hasRange = region !== null && region.endMs > region.startMs;
  const lineMs = selectionLineMs ?? Math.round(state.playbackPositionMs);

  // Insert and Replace both bring audio in through the import picker; the
  // placement tells the reducer where it lands (at the line, or over the
  // range) instead of the lane's end.
  const pendingPlacementRef = useRef<ClipPlacement | null>(null);
  const addClipPlaced = useCallback(
    (clip: LocalClip) => {
      const placement = pendingPlacementRef.current;
      pendingPlacementRef.current = null;
      addClip(clip, placement ?? undefined);
    },
    [addClip]
  );
  addClipPlacedRef.current = addClipPlaced;
  const handleInsertOrReplace = useCallback(() => {
    if (hasRange && region) {
      pendingPlacementRef.current = {
        atMs: region.startMs,
        mode: 'overwrite',
        laneIndex: region.laneIndex,
      };
    } else {
      pendingPlacementRef.current = {
        atMs: lineMs,
        mode: 'insert',
        laneIndex: state.activeLaneIndex,
      };
    }
    void importAudio();
  }, [hasRange, region, lineMs, state.activeLaneIndex, importAudio]);

  const clipUnderLine = useMemo(
    () =>
      state.clips.find(
        (c) =>
          c.laneIndex === state.activeLaneIndex &&
          lineMs > c.positionInTimeline &&
          lineMs < c.positionInTimeline + (c.endInSegment - c.startInSegment)
      ),
    [state.clips, state.activeLaneIndex, lineMs]
  );
  const handleSplit = useCallback(() => {
    if (hasRange && region) {
      // Split at both edges of the range so it becomes its own clip.
      splitLaneAt(region.laneIndex, region.endMs);
      splitLaneAt(region.laneIndex, region.startMs);
      return;
    }
    splitLaneAt(state.activeLaneIndex, lineMs);
  }, [hasRange, region, splitLaneAt, state.activeLaneIndex, lineMs]);

  const handleDuplicate = useCallback(() => {
    if (hasRange && region) {
      copyRegion();
      // Paste right after the range, on the same lane.
      pasteRegion(region.endMs, region.laneIndex);
      return;
    }
    if (state.selectedClipId) duplicateClip(state.selectedClipId);
  }, [hasRange, region, copyRegion, pasteRegion, state.selectedClipId, duplicateClip]);

  // ── Track menu ──
  // The wrench opens the native sheet that already existed for lanes (name,
  // color, pan, move, delete), plus the two manual entries SoundLab keeps in
  // its own menu (typed gain and pan).
  const [editingLaneIndex, setEditingLaneIndex] = useState<number | null>(null);
  const openTrackMenu = useCallback((laneIndex: number) => {
    setEditingLaneIndex(laneIndex);
  }, []);
  const editingMeta =
    editingLaneIndex !== null ? state.laneMeta[editingLaneIndex] : undefined;
  const editingLaneHasClips =
    editingLaneIndex !== null
      ? state.clips.some((c) => c.laneIndex === editingLaneIndex)
      : false;
  const handleLaneEditSave = useCallback(
    (meta: LaneMeta) => {
      if (editingLaneIndex === null) return;
      setLaneMeta(editingLaneIndex, meta);
    },
    [editingLaneIndex, setLaneMeta]
  );
  const handleLaneEditPan = useCallback(
    (pan: number, commit: boolean) => {
      if (editingLaneIndex === null) return;
      setLanePan(editingLaneIndex, pan, { commit });
    },
    [editingLaneIndex, setLanePan]
  );
  const handleLaneEditDelete = useCallback(() => {
    if (editingLaneIndex === null) return;
    const lane = editingLaneIndex;
    setEditingLaneIndex(null);
    handleRemoveLane(lane);
  }, [editingLaneIndex, handleRemoveLane]);
  const handleLaneMove = useCallback(
    (direction: -1 | 1) => {
      if (editingLaneIndex === null) return;
      moveLane(editingLaneIndex, direction);
      setEditingLaneIndex(editingLaneIndex + direction);
    },
    [editingLaneIndex, moveLane]
  );

  // ── Add track ──
  // SoundLab's "Create New Track" sheet. Files and instant recording are
  // wired; the library and text to speech sources land with the embedded
  // tools phase and are listed in the parity checklist.
  const [ttsVisible, setTtsVisible] = useState(false);
  const [ttsBusy, setTtsBusy] = useState(false);

  /**
   * Brings a local file in as a new track: upload, place at the start of a
   * fresh lane, refresh the segment list. Shared by text to speech and the
   * music library, which both produce a file on disk.
   */
  const addFileAsTrack = useCallback(
    async (path: string, name: string, mime: string, source: string) => {
      const lane = state.laneCount;
      addLane();
      setActiveLane(lane);
      const uri = path.startsWith('file://') ? path : `file://${path}`;
      const serverClip = await projectService.uploadAudio(
        projectId,
        uri,
        name,
        mime,
        lane,
        undefined,
        undefined,
        0
      );
      addClip(serverClipToLocal(serverClip), {
        atMs: 0,
        mode: 'insert',
        laneIndex: lane,
      });
      try {
        const fresh = await projectService.getProject(projectId);
        setLocalSegments((prev) => {
          const freshIds = new Set(fresh.segments.map((s) => s.id));
          return [...prev.filter((s) => !freshIds.has(s.id)), ...fresh.segments];
        });
      } catch {
        // The clip is placed; the segment list refreshes on the next fetch.
      }
      analytics.capture(ANALYTICS_EVENTS.PROJECT.TRACK_SOURCE, {
        project_id: projectId,
        source,
        lane_index: lane,
      });
    },
    [projectId, state.laneCount, addLane, setActiveLane, addClip]
  );

  const createSpeechTrack = useCallback(
    async (input: { text: string; voiceId?: string; rate: number; pitch: number }) => {
      setTtsBusy(true);
      const t0 = Date.now();
      try {
        const outPath = `${FileSystem.cacheDirectory}tts-${Date.now()}.caf`;
        const spoken = await renderSpeech(input.text, outPath, {
          voiceId: input.voiceId,
          rate: input.rate,
          pitch: input.pitch,
        });
        if (!spoken) throw new Error('Text to speech is not in this build');
        let uploadPath = spoken.outputPath;
        let uploadName = `speech-${Date.now()}.caf`;
        let uploadMime = 'audio/x-caf';
        if (isTranscodeAvailable()) {
          const wav = `${FileSystem.cacheDirectory}tts-${Date.now()}.wav`;
          const converted = await toTelephonyWav(spoken.outputPath, wav);
          if (converted && converted.outputBytes > 0) {
            uploadPath = converted.outputPath;
            uploadName = `speech-${Date.now()}.wav`;
            uploadMime = 'audio/wav';
          }
        }
        await addFileAsTrack(uploadPath, uploadName, uploadMime, 'text_to_speech');
        analytics.capture(ANALYTICS_EVENTS.PROJECT.TRACK_SOURCE, {
          project_id: projectId,
          source: 'text_to_speech',
          outcome: 'ok',
          characters: input.text.length,
          duration_sec: spoken.durationSec,
          total_ms: Date.now() - t0,
        });
        return true;
      } catch (error: unknown) {
        analytics.capture(ANALYTICS_EVENTS.PROJECT.TRACK_SOURCE, {
          project_id: projectId,
          source: 'text_to_speech',
          outcome: 'failed',
          error: error instanceof Error ? error.message : String(error),
          total_ms: Date.now() - t0,
        });
        showToast(t('studio.tts.failed'));
        return false;
      } finally {
        setTtsBusy(false);
      }
    },
    [projectId, addFileAsTrack, t]
  );

  const importFromMusicLibrary = useCallback(async () => {
    const t0 = Date.now();
    try {
      if (musicLibraryStatus() !== 'granted') {
        const granted = await requestMusicLibrary();
        if (!granted) {
          showToast(t('studio.musicLibraryDenied'));
          return;
        }
      }
      const outPath = `${FileSystem.cacheDirectory}song-${Date.now()}.m4a`;
      const picked = await pickFromMusicLibrary(outPath);
      if (!picked) return;
      await addFileAsTrack(
        picked.path,
        `${picked.title || 'song'}.m4a`,
        'audio/m4a',
        'music_library'
      );
      analytics.capture(ANALYTICS_EVENTS.PROJECT.TRACK_SOURCE, {
        project_id: projectId,
        source: 'music_library',
        outcome: 'ok',
        duration_sec: picked.durationSec,
        total_ms: Date.now() - t0,
      });
    } catch (error: unknown) {
      analytics.capture(ANALYTICS_EVENTS.PROJECT.TRACK_SOURCE, {
        project_id: projectId,
        source: 'music_library',
        outcome: 'failed',
        error: error instanceof Error ? error.message : String(error),
        total_ms: Date.now() - t0,
      });
      showToast(t('studio.musicLibraryFailed'));
    }
  }, [projectId, addFileAsTrack, t]);

  const openAddTrack = useCallback(() => {
    const options = [
      t('studio.fromFiles'),
      t('studio.fromVideo'),
      t('studio.fromLibrary'),
      t('studio.textToSpeech'),
      t('studio.instantRecording'),
      t('common:cancel', 'Cancel'),
    ];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: t('studio.createTrackTitle'),
        options,
        cancelButtonIndex: 5,
        userInterfaceStyle: 'dark',
      },
      (index) => {
        if (index === 0 || index === 1) {
          const lane = state.laneCount;
          addLane();
          setActiveLane(lane);
          pendingPlacementRef.current = { atMs: 0, mode: 'insert', laneIndex: lane };
          void importAudio(index === 1 ? 'video' : 'audio');
        } else if (index === 2) {
          void importFromMusicLibrary();
        } else if (index === 3) {
          setTtsVisible(true);
        } else if (index === 4) {
          const lane = state.laneCount;
          addLane();
          setActiveLane(lane);
          setRecordSheetVisible(true);
        }
      }
    );
  }, [t, state.laneCount, addLane, setActiveLane, importAudio, importFromMusicLibrary]);

  const handleRemoveActiveLane = useCallback(() => {
    handleRemoveLane(state.activeLaneIndex);
  }, [handleRemoveLane, state.activeLaneIndex]);

  // ── Recording sheet (project mode) ──
  // The take is captured by the native recorder; on Place it is normalised
  // to the pipeline's format, uploaded at the selection line and dropped on
  // the active lane over whatever was there (the reducer's overwrite
  // placement), exactly where the sheet said it would start.
  const [recordSheetVisible, setRecordSheetVisible] = useState(false);
  // The recorder plays the other tracks itself, from local copies on one
  // shared anchor time. The timeline's own playback stays off while the sheet
  // is open: expo-audio activates the session synchronously on the main
  // thread and doing that under the recorder freezes the app.
  const { prepare: prepareOverdubStems } = useOverdubStems(
    localSegments,
    segmentDurationMap
  );
  const prepareStems = useCallback(
    (excludeLane: number) => prepareOverdubStems(currentClipsRef.current, excludeLane),
    [prepareOverdubStems]
  );
  useEffect(() => {
    if (recordSheetVisible) setPlaying(false);
  }, [recordSheetVisible, setPlaying]);
  const placeTake = useCallback(
    async (take: StopResult) => {
      const src = take.path.startsWith('file://') ? take.path : `file://${take.path}`;
      let uploadUri = src;
      let name = `take-${Date.now()}.caf`;
      let mime = 'audio/x-caf';
      if (isTranscodeAvailable()) {
        const out = `${FileSystem.cacheDirectory}take-8k-${Date.now()}.wav`;
        const tr = await toTelephonyWav(src, out);
        if (tr && tr.outputBytes > 0) {
          uploadUri = tr.outputPath;
          name = `take-${Date.now()}.wav`;
          mime = 'audio/wav';
        }
      }
      const lane = state.activeLaneIndex;
      const at = take.fromMs;
      const serverClip = await projectService.uploadAudio(
        projectId,
        uploadUri,
        name,
        mime,
        lane,
        undefined,
        undefined,
        at
      );
      addClip(serverClipToLocal(serverClip), {
        atMs: at,
        mode: 'overwrite',
        laneIndex: lane,
      });
      try {
        const fresh = await projectService.getProject(projectId);
        setLocalSegments((prev) => {
          const freshIds = new Set(fresh.segments.map((s) => s.id));
          return [...prev.filter((s) => !freshIds.has(s.id)), ...fresh.segments];
        });
      } catch {
        // The clip is placed; the segment list refreshes on the next fetch.
      }
      analytics.capture(ANALYTICS_EVENTS.CALL.RECORDING_PLACED, {
        phase: 'placed',
        engine: 'studio_recorder',
        clip_id: serverClip?.id ?? null,
        requested_position_ms: at,
        lane_index: lane,
        take_ms: take.durationMs,
      });
      showToast(t('studio.record.placed'));
    },
    [projectId, state.activeLaneIndex, addClip, t]
  );

  // ── Volume automation ──
  // The envelope is per clip and non destructive: points live on the
  // project's settings and the mix applies them, the audio never changes.
  const automationPoints = useMemo(
    () =>
      selectedClip
        ? ((settings.automation?.[selectedClip.id] ?? []) as EnvelopePoint[])
        : [],
    [settings.automation, selectedClip]
  );
  const handleAutomationChange = useCallback(
    (points: EnvelopePoint[], commit: boolean) => {
      if (!selectedClip) return;
      const automation = { ...(settings.automation ?? {}), [selectedClip.id]: points };
      const next = { ...settings, automation };
      if (!commit) {
        setSettings(next);
        return;
      }
      void saveSettings(next);
      analytics.capture(ANALYTICS_EVENTS.PROJECT.AUTOMATION_SET, {
        project_id: projectId,
        clip_id: selectedClip.id,
        point_count: points.length,
      });
    },
    [selectedClip, settings, saveSettings, projectId]
  );

  // ── Tutorial tips ──
  // Shown once per device after the first take or import lands (an empty
  // editor has nothing to point at), and again from the settings sheet.
  const [tipsVisible, setTipsVisible] = useState(false);
  const [tipTargets, setTipTargets] = useState<Partial<Record<TipTarget, TipRect>>>({});
  const containerRef = useRef<View>(null);
  const tracksRef = useRef<View>(null);
  const effectRef = useRef<View>(null);
  const undoRedoRef = useRef<View>(null);
  const zoomRef = useRef<View>(null);
  const measureTips = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    container.measureInWindow((cx, cy) => {
      const next: Partial<Record<TipTarget, TipRect>> = {};
      const pending: [TipTarget, View | null, (r: TipRect) => TipRect][] = [
        [
          'track',
          tracksRef.current,
          (r) => ({ ...r, y: r.y + STUDIO.rulerHeight, height: STUDIO.trackHeight }),
        ],
        [
          'clip',
          tracksRef.current,
          (r) => ({
            x: r.x + STUDIO.panelWidth,
            y: r.y + STUDIO.rulerHeight,
            width: r.width - STUDIO.panelWidth,
            height: STUDIO.trackHeight,
          }),
        ],
        ['effect', effectRef.current, (r) => r],
        ['undoRedo', undoRedoRef.current, (r) => r],
        ['zoom', zoomRef.current, (r) => r],
      ];
      let left = pending.length;
      for (const [key, view, adjust] of pending) {
        if (!view) {
          left -= 1;
          continue;
        }
        view.measureInWindow((x, y, width, height) => {
          next[key] = adjust({ x: x - cx, y: y - cy, width, height });
          left -= 1;
          if (left === 0) setTipTargets({ ...next });
        });
      }
      if (left === 0) setTipTargets(next);
    });
  }, []);
  const showTips = useCallback(() => {
    measureTips();
    setTipsVisible(true);
  }, [measureTips]);
  // Once per device, the first time the editor opens. The flag is written the
  // moment they appear, not when they are dismissed, so a force quit or a
  // crash can never bring them back (David, Sep 19: under no circumstance
  // should they show again).
  const tipsAutoShownRef = useRef(false);
  useEffect(() => {
    if (tipsAutoShownRef.current) return;
    tipsAutoShownRef.current = true;
    if (studioPrefs.tipsSeen()) return;
    studioPrefs.setTipsSeen(true);
    const timer = setTimeout(showTips, 700);
    return () => clearTimeout(timer);
  }, [showTips]);
  const finishTips = useCallback(() => {
    studioPrefs.setTipsSeen(true);
    setTipsVisible(false);
  }, []);

  // ── Native timeline data ──
  const clipPeaks = useClipPeaks(state.clips, segmentDurationMap);
  const nativeTracks = useMemo(
    () =>
      Array.from({ length: state.laneCount }, (_, i) => ({
        id: `lane-${i}`,
        height: STUDIO.trackHeight,
      })),
    [state.laneCount]
  );
  const nativeClips = useMemo(() => {
    const list = state.clips.map((c) => ({
      id: c.id,
      trackIndex: c.laneIndex,
      startMs: c.positionInTimeline,
      durationMs: c.endInSegment - c.startInSegment,
      peaks: clipPeaks.get(c.id) ?? [],
      selected: c.id === state.selectedClipId,
      muted: state.laneMeta[c.laneIndex]?.muted === true,
    }));
    // The take being recorded grows in place until its clip lands.
    if (isRecording || isUploadingRecording) {
      list.push({
        id: '__recording__',
        trackIndex: recordingLaneRef.current,
        startMs: recordingStartMsRef.current,
        durationMs: Math.max(50, recordingElapsedMs),
        peaks: [],
        selected: true,
        muted: false,
      });
    }
    return list;
  }, [
    state.clips,
    state.selectedClipId,
    state.laneMeta,
    clipPeaks,
    isRecording,
    isUploadingRecording,
    recordingElapsedMs,
  ]);
  const timelineHeight = STUDIO.rulerHeight + STUDIO.trackHeight * state.laneCount;
  const panelInset = panelsCollapsed ? 0 : STUDIO.panelWidth;

  // Output meters: fed by the native engine when it reports levels; idle
  // otherwise. Shared values so the bars never render in JS.
  const leftLevelSv = useSharedValue(0);
  const rightLevelSv = useSharedValue(0);

  const selectionStartMs = hasRange && region ? region.startMs : null;
  const selectionEndMs = hasRange && region ? region.endMs : null;

  // Record slot: during a call the existing record the call button stays,
  // with its elapsed counter; in a project the mic button opens the take.
  const recordSlot =
    recordingMode === 'twilioCall' ? (
      <CallRecordButton
        isRecording={isRecording}
        elapsed={formatElapsedSeconds(recordingElapsed)}
        onPress={isRecording ? stopRecording : startRecording}
        disabled={isUploadingRecording}
      />
    ) : undefined;

  return (
    <SafeAreaView
      ref={containerRef}
      style={[
        styles.container,
        callBarVisible && { paddingTop: IN_CALL_BAR_HEIGHT },
        // The readout sits as low as SoundLab's, with only the home indicator
        // below it, instead of losing the whole bottom inset to empty black.
        { paddingBottom: Math.max(4, insets.bottom - 24) },
      ]}
      edges={['top']}
    >
      {topSlot}

      <StudioTopBar
        onClose={handleClose}
        onAddTrack={openAddTrack}
        onRemoveTrack={handleRemoveActiveLane}
        canRemoveTrack={state.laneCount > 1}
        onConfig={() => setConfigVisible(true)}
        onShare={() => setExporterVisible(true)}
        canShare={state.clips.length > 0 && !isPublishing}
      />

      <ClipActionsBar
        hasRange={hasRange}
        onInsertOrReplace={handleInsertOrReplace}
        canInsertOrReplace={!isImporting && !isRecording}
        onSplitNew={splitRegionToNewLane}
        canSplitNew={hasRange}
        onSplit={handleSplit}
        canSplit={hasRange || clipUnderLine !== undefined}
        onJoin={handleJoin}
        canJoin={joinPair !== null}
        onDuplicate={handleDuplicate}
        canDuplicate={hasRange || state.selectedClipId !== null}
      />

      {/* Tracks: the native timeline scrolls horizontally on its own; this
          outer ScrollView only scrolls vertically when the lanes overflow.
          The JS track panels sit over the view's left inset and scroll with
          it vertically. */}
      <View ref={tracksRef} collapsable={false} style={styles.timelineContainer}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          contentContainerStyle={{ minHeight: timelineHeight }}
        >
          <View style={{ height: timelineHeight }}>
            <TimelineSurface
              ref={timelineRef}
              positionSv={positionSv}
              height={timelineHeight}
              tracks={nativeTracks}
              clips={nativeClips}
              pixelsPerSecond={state.zoomLevel * PIXELS_PER_SECOND_AT_ZOOM_1}
              selectionLineMs={selectionLineMs}
              selection={
                hasRange && region
                  ? {
                      trackIndex: region.laneIndex,
                      startMs: region.startMs,
                      endMs: region.endMs,
                    }
                  : null
              }
              durationMs={totalDuration}
              rulerFormat={prefs.timelineMarker}
              leftInset={panelInset}
              followPlayhead={state.isPlaying || isRecording}
              onTap={handleTimelineTap}
              onDoubleTap={handleTimelineDoubleTap}
              onSelectionChange={handleSelectionChange}
              onClipMove={handleClipMove}
              onTrackDrag={handleTrackDrag}
              onZoom={handleZoomEvent}
              onPlayheadScrub={handlePlayheadScrub}
            />
            <View
              style={[styles.panelsOverlay, { width: STUDIO.panelWidth }]}
              pointerEvents="box-none"
            >
              <Pressable
                onPress={() => setPanelsCollapsed((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={t('studio.togglePanels')}
                style={[
                  styles.collapseButton,
                  panelsCollapsed && styles.collapseButtonCollapsed,
                ]}
                hitSlop={8}
              >
                {panelsCollapsed ? (
                  <ChevronRight size={14} color={STUDIO_COLORS.text} strokeWidth={2.5} />
                ) : (
                  <ChevronLeft size={14} color={STUDIO_COLORS.text} strokeWidth={2.5} />
                )}
              </Pressable>
              {!panelsCollapsed &&
                Array.from({ length: state.laneCount }, (_, i) => (
                  <View
                    key={`panel-${i}`}
                    style={{
                      position: 'absolute',
                      top: STUDIO.rulerHeight + i * STUDIO.trackHeight,
                      left: 0,
                    }}
                  >
                    <TrackPanel
                      showIndex={prefs.showTrackIndex}
                      laneIndex={i}
                      meta={state.laneMeta[i]}
                      isActive={state.activeLaneIndex === i}
                      onSelect={() => setActiveLane(i)}
                      onOpenMenu={() => openTrackMenu(i)}
                      onToggleMute={() =>
                        setLaneMute(i, !(state.laneMeta[i]?.muted ?? false))
                      }
                      onToggleSolo={() =>
                        setLaneSolo(i, !(state.laneMeta[i]?.solo ?? false))
                      }
                      onGainChange={(db, commit) => commitLaneGain(i, db, commit)}
                      onPanChange={(pan, commit) => setLanePan(i, pan, { commit })}
                    />
                  </View>
                ))}
            </View>
          </View>
        </ScrollView>

        {state.clips.length === 0 && !isRecording && (
          <View style={styles.emptyOverlay} pointerEvents="none">
            <Text variant="body" style={styles.emptyText}>
              {t('timeline.emptyClips')}
            </Text>
          </View>
        )}
        {isTransmitting && (
          <View style={styles.transmitChip} pointerEvents="none">
            <Text variant="caption" style={styles.transmitChipText}>
              {t('timeline.transmitting')}
            </Text>
          </View>
        )}
      </View>

      {automationActive && (
        <AutomationPanel
          clip={selectedClip ?? null}
          clipLabel={
            selectedClip
              ? `${laneName(selectedClip.laneIndex)} · ${formatTimelineMs(
                  selectedClip.endInSegment - selectedClip.startInSegment
                )}`
              : ''
          }
          peaks={selectedClip ? (clipPeaks.get(selectedClip.id) ?? []) : []}
          points={automationPoints}
          onChange={handleAutomationChange}
          onClose={() => setAutomationActive(false)}
        />
      )}

      <ZoomRow
        automationActive={automationActive}
        onToggleAutomation={() => setAutomationActive((v) => !v)}
        onZoomOut={zoomOut}
        onZoomIn={zoomIn}
        canZoomOut={state.zoomLevel > ZOOM_MIN + 0.001}
        canZoomIn={state.zoomLevel < ZOOM_MAX - 0.001}
        zoomRef={zoomRef}
      />

      <RangeActionsBar
        hasRange={hasRange}
        canPaste={state.clipboard !== null}
        onCopy={copyRegion}
        onCut={() => cutRegion(true)}
        onPaste={() => pasteRegion(lineMs, state.activeLaneIndex)}
        onEffect={() => {
          if (hasRange) setEffectsSheetVisible(true);
        }}
        onRemove={() => deleteRegion(true)}
        onSilence={silenceRegion}
        onTrim={trimToRegion}
        effectRef={effectRef}
      />

      <TransportBar
        isPlaying={state.isPlaying}
        canPlay={state.clips.length > 0}
        onTogglePlay={handlePlayPause}
        leftLevelSv={leftLevelSv}
        rightLevelSv={rightLevelSv}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        recordSlot={recordSlot}
        onRecord={() => setRecordSheetVisible(true)}
        recording={recordSheetVisible}
        loopActive={loopActive}
        onToggleLoop={toggleLoop}
        onMasterEffects={() => setMasterSheetVisible(true)}
        undoRedoRef={undoRedoRef}
      />

      <StatusReadout
        selectionStartMs={selectionStartMs}
        selectionEndMs={selectionEndMs}
        positionSv={positionSv}
      />

      <AudioPreparingModal
        visible={isUploadingRecording || isImporting}
        mode={isUploadingRecording ? 'recording' : 'import'}
        onCancel={isImporting && !isUploadingRecording ? cancelImport : undefined}
        progress={isUploadingRecording ? null : importProgress}
      />

      <RangeEffectsSheet
        visible={effectsSheetVisible}
        onClose={() => setEffectsSheetVisible(false)}
        onPick={handlePickEffect}
        rangeLabel={
          hasRange && region ? formatTimelineMs(region.endMs - region.startMs) : ''
        }
      />

      <EffectDialog
        effect={activeEffect}
        onCancel={handleCancelEffect}
        onPreview={handlePreviewEffect}
        onApply={handleApplyEffect}
        busy={rangeEffects.busy}
        previewing={rangeEffects.previewing}
        progress={rangeEffects.progress}
        errorText={rangeEffects.lastError}
      />

      <RecordSheet
        visible={recordSheetVisible}
        onClose={() => setRecordSheetVisible(false)}
        fromMs={lineMs}
        onPlace={placeTake}
        prepareStems={prepareStems}
        laneIndex={state.activeLaneIndex}
        blocked={recordingMode === 'twilioCall'}
        trackName={laneName(state.activeLaneIndex)}
      />

      <LaneEditSheet
        visible={editingLaneIndex !== null}
        laneIndex={editingLaneIndex ?? 0}
        currentMeta={editingMeta}
        hasClips={editingLaneHasClips}
        canDelete={state.laneCount > 1}
        onClose={() => setEditingLaneIndex(null)}
        onSave={handleLaneEditSave}
        onDelete={handleLaneEditDelete}
        onPanChange={handleLaneEditPan}
        onMove={handleLaneMove}
        canMoveUp={(editingLaneIndex ?? 0) > 0}
        canMoveDown={(editingLaneIndex ?? 0) < state.laneCount - 1}
      />

      <StudioConfigSheet
        visible={configVisible}
        onClose={() => setConfigVisible(false)}
        isSaving={isSaving}
        isDirty={state.isDirty}
        onReplayTips={() => setTimeout(showTips, 350)}
        onPrefsChange={() => setPrefsVersion((v) => v + 1)}
      />

      <MasterEffectsSheet
        visible={masterSheetVisible}
        onClose={() => setMasterSheetVisible(false)}
        value={settings.master ?? {}}
        onChange={handleMasterChange}
      />

      <ExporterSheet
        visible={exporterVisible}
        onClose={() => setExporterVisible(false)}
        initial={settings.exportPrefs ?? {}}
        busy={isPublishing}
        onPickCover={handlePickCover}
        onMixdown={handleMixdown}
        actionLabel={onPublish ? t('studio.export.post') : t('studio.export.mixdown')}
      />

      <TextToSpeechSheet
        visible={ttsVisible}
        onClose={() => setTtsVisible(false)}
        busy={ttsBusy}
        onCreate={createSpeechTrack}
      />

      <StudioTips visible={tipsVisible} targets={tipTargets} onDone={finishTips} />

      <Toast />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: STUDIO_COLORS.background,
  },
  timelineContainer: {
    flex: 1,
    backgroundColor: STUDIO_COLORS.background,
  },
  panelsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
  },
  collapseButton: {
    position: 'absolute',
    top: 4,
    left: (STUDIO.panelWidth - 22) / 2,
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: STUDIO_COLORS.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: STUDIO_COLORS.surfaceRaised,
  },
  collapseButtonCollapsed: {
    left: 4,
  },
  emptyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: STUDIO.panelWidth,
  },
  emptyText: {
    color: STUDIO_COLORS.textMuted,
    textAlign: 'center',
  },
  transmitChip: {
    position: 'absolute',
    top: 8,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  transmitChipText: {
    color: STUDIO_COLORS.text,
  },
});
