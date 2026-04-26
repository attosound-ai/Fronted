import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, Modal } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  X,
  CloudUpload,
  Circle,
  CloudCheck,
  Play,
  Pause,
  Plus,
  Volume1,
  Volume2,
  SkipBack,
  SkipForward,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { Toast, showToast } from '@/components/ui/Toast';
import { TimelineRuler } from './TimelineRuler';
import { TimelineTrack } from './TimelineTrack';
import { TimelinePlayhead } from './TimelinePlayhead';
import { TimelineToolbar } from './TimelineToolbar';
import { LanePanel } from './LanePanel';
import { LaneEditSheet } from './LaneEditSheet';
import { AudioPreparingModal } from './AudioPreparingModal';
import { useTimeline } from '../hooks/useTimeline';
import { useTimelinePlayback } from '../hooks/useTimelinePlayback';
import { useImportAudio } from '../hooks/useImportAudio';
import { useRecordAudio } from '../hooks/useRecordAudio';
import { useTwilioCallRecording } from '../hooks/useTwilioCallRecording';
import { serverClipToLocal, clipToInput } from '../types';
import { getTimelineDuration } from '../utils/clipOperations';
import { msToPixels, formatTimelineMs } from '../utils/timelineCalculations';
import { projectService } from '@/lib/api/projectService';
import type { LaneMeta } from '../types';
import type { TimelineClip, LaneMetadata, ExportResult } from '@/types/project';
import type { AudioSegment } from '@/types/call';

interface TimelineEditorProps {
  projectId: string;
  clips: TimelineClip[];
  segments: (AudioSegment & { downloadUrl: string })[];
  lanes?: Record<string, LaneMetadata>;
  onClose: () => void;
  onPublish?: (result: ExportResult, durationMs: number) => Promise<void>;
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

// Timeline geometry — tuned for readability over cramming tracks. On a
// modern iPhone (17 Pro / 16 Pro, ~874pt height) ~3 tracks fit fully;
// anything beyond that scrolls vertically. Gives ~13pt of clearance
// between the gain slider thumb and the pan label, and ~41pt between
// the pan slider and the Mute/Solo pills.
const TRACK_HEIGHT = 180;
const LANE_PADDING = 4;
const RULER_HEIGHT = 28;
const LANE_LABEL_WIDTH = 128; // matches LanePanel width
const RULER_LEFT_GUTTER = 16; // breathing room between sticky panels and ruler start
const ADD_TRACK_ROW_HEIGHT = 42; // dashed "+ Add Track" row below the last lane

export function TimelineEditor({
  projectId,
  clips: serverClips,
  segments,
  lanes: serverLanes,
  onClose,
  onPublish,
  recordingMode = 'mic',
  topSlot,
}: TimelineEditorProps) {
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
    splitAtPlayhead,
    deleteSelectedClip,
    trimClip,
    setVolume,
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
    moveClip,
    moveClipToPosition,
    duplicateClip,
    removeLane,
    setLaneMeta,
    setLaneMute,
    setLaneSolo,
    setLaneGain,
    setLanePan,
  } = useTimeline(initialClips, initialLaneMeta);

  const { t } = useTranslation('projects');
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [volumeModalVisible, setVolumeModalVisible] = useState(false);
  const [editingLaneIndex, setEditingLaneIndex] = useState<number | null>(null);

  const { importAudio: rawImportAudio, isImporting } = useImportAudio({
    projectId,
    activeLaneIndex: state.activeLaneIndex,
    addClip,
  });

  // Wrap import to also refresh segments (useImportAudio only adds the clip)
  const importAudio = useCallback(async () => {
    await rawImportAudio();
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
  }, [rawImportAudio, projectId]);

  // Recording → upload → new clip on the active lane. Both hooks are
  // instantiated unconditionally to satisfy rules-of-hooks; the inactive
  // one is a no-op until its `startRecording` is called, so the
  // resource cost is negligible. The caller picks which one drives the
  // toolbar via the `recordingMode` prop.
  const micRecording = useRecordAudio({
    projectId,
    activeLaneIndex: state.activeLaneIndex,
    addClip,
  });
  const twilioRecording = useTwilioCallRecording({
    projectId,
    activeLaneIndex: state.activeLaneIndex,
    addClip,
  });
  const {
    startRecording: rawStartRecording,
    stopRecording: rawStopRecording,
    isRecording,
    isUploading: isUploadingRecording,
    elapsed: recordingElapsed,
    elapsedMs: recordingElapsedMs,
  } = recordingMode === 'twilioCall' ? twilioRecording : micRecording;

  // Snapshot where the live recording placeholder starts on the
  // timeline. Computed at start-recording time so the placeholder grows
  // from that x-position regardless of later edits.
  const recordingStartMsRef = useRef(0);
  const recordingLaneRef = useRef(0);

  const startRecording = useCallback(async () => {
    // Place the new clip after the last clip on the active lane so it
    // doesn't overlap existing audio (same semantics as the server-side
    // append on uploadAudio).
    const laneClips = state.clips.filter(
      (c) => c.laneIndex === state.activeLaneIndex
    );
    const lastEnd = laneClips.reduce((max, c) => {
      const end = c.positionInTimeline + (c.endInSegment - c.startInSegment);
      return end > max ? end : max;
    }, 0);
    recordingStartMsRef.current = lastEnd;
    recordingLaneRef.current = state.activeLaneIndex;
    await rawStartRecording();
  }, [state.clips, state.activeLaneIndex, rawStartRecording]);

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

  useTimelinePlayback({
    clips: state.clips,
    segments: localSegments,
    playbackPositionMs: state.playbackPositionMs,
    isPlaying: state.isPlaying,
    laneMeta: state.laneMeta,
    onPositionChange: setPlaybackPosition,
    onPlayingChange: setPlaying,
  });

  const totalDuration = getTimelineDuration(state.clips);
  const totalWidth = msToPixels(totalDuration + 5000, state.zoomLevel);
  const tracksAreaHeight = TRACK_HEIGHT * state.laneCount;

  // Pinch-to-zoom (.runOnJS(true) avoids worklet serialization warnings)
  const zoomRef = useRef(state.zoomLevel);
  zoomRef.current = state.zoomLevel;
  const baseZoomRef = useRef(1);

  // Tap empty space → deselect (uses timer so track onSelect can cancel)
  const deselectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const tapGesture = useMemo(
    () =>
      Gesture.Tap()
        .runOnJS(true)
        .onEnd(() => {
          deselectTimerRef.current = setTimeout(() => selectClip(null), 60);
        }),
    [selectClip]
  );

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .onBegin(() => {
          baseZoomRef.current = zoomRef.current;
        })
        .onUpdate((e) => {
          setZoom(baseZoomRef.current * e.scale);
        }),
    [setZoom]
  );

  const composedGesture = useMemo(
    () => Gesture.Simultaneous(pinchGesture, tapGesture),
    [pinchGesture, tapGesture]
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

  // Skip to the start of the timeline. Pauses playback so the user can
  // hit play and start fresh from the beginning.
  const handleSkipToStart = useCallback(() => {
    setPlaying(false);
    setPlaybackPosition(0);
  }, [setPlaying, setPlaybackPosition]);

  // Skip to the very end of the timeline (just past the last clip's
  // trailing edge). Pauses so the user can position the playhead and
  // record/insert from there without immediately running off the end.
  const handleSkipToEnd = useCallback(() => {
    setPlaying(false);
    setPlaybackPosition(totalDuration);
  }, [setPlaying, setPlaybackPosition, totalDuration]);

  // Autosave: debounced 2s after any edit.
  // Refs track current state so we can detect if edits happened during save.
  const savingRef = useRef(false);
  const currentClipsRef = useRef(state.clips);
  currentClipsRef.current = state.clips;
  const currentLaneMetaRef = useRef(state.laneMeta);
  currentLaneMetaRef.current = state.laneMeta;

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
      } catch {
        showToast(t('timeline.errorAutosaveFailed'));
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

  const handleExport = useCallback(async () => {
    if (state.clips.length === 0) {
      showToast(t('timeline.errorNoClipsToExport'));
      return;
    }

    try {
      await flushSave();
      const result = await projectService.exportProject(projectId);

      if (onPublish) {
        setIsPublishing(true);
        try {
          await onPublish(result, getTimelineDuration(state.clips));
        } finally {
          setIsPublishing(false);
        }
      } else {
        Alert.alert(
          t('timeline.exportCompleteTitle'),
          t('timeline.exportCompleteMessage', {
            size: Math.round(result.fileSizeBytes / 1024),
          }),
          [{ text: t('timeline.exportCompleteOk') }]
        );
      }
    } catch {
      showToast(t('timeline.errorExportFailed'));
    }
  }, [projectId, state.clips, flushSave, onPublish]);

  const handleClose = useCallback(async () => {
    if (state.isDirty) {
      try {
        await flushSave();
      } catch {
        // Best-effort save before closing
      }
    }
    // onClose may be async (refetches project data before unmounting)
    await onClose();
  }, [state.isDirty, state.clips.length, flushSave, onClose]);

  const handleRemoveLane = useCallback(
    (laneIndex: number) => {
      const hasClips = state.clips.some((c) => c.laneIndex === laneIndex);
      if (hasClips) {
        showToast(t('timeline.errorRemoveClipsFirst'));
        return;
      }
      removeLane(laneIndex);
    },
    [state.clips, removeLane]
  );

  // Open the lane edit sheet. The sheet handles name + color + delete
  // in a single UI; all the previous Alert.prompt/Alert.alert chain was
  // replaced by LaneEditSheet.
  const handleEditLane = useCallback((laneIndex: number) => {
    setEditingLaneIndex(laneIndex);
  }, []);

  const handleLaneEditSave = useCallback(
    (meta: LaneMeta) => {
      if (editingLaneIndex === null) return;
      setLaneMeta(editingLaneIndex, meta);
      // setLaneMeta already flips isDirty=true, which triggers the
      // existing autosave effect (see useEffect on state.isDirty above).
    },
    [editingLaneIndex, setLaneMeta]
  );

  const handleLaneEditDelete = useCallback(() => {
    if (editingLaneIndex === null) return;
    handleRemoveLane(editingLaneIndex);
  }, [editingLaneIndex, handleRemoveLane]);

  const editingMeta =
    editingLaneIndex !== null ? state.laneMeta[editingLaneIndex] : undefined;
  const editingLaneHasClips =
    editingLaneIndex !== null
      ? state.clips.some((c) => c.laneIndex === editingLaneIndex)
      : false;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Optional caller-injected slot (used by ActiveCallScreen for the
          in-call control bar) — rendered above the editor's own header. */}
      {topSlot}

      {/* Header — close button on the left, transport controls (skip
          back / play / skip forward) in the middle, and a tiny save
          indicator on the right. The "Timeline Editor" title was
          removed to give the transport controls more space. */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleClose}
          style={styles.closeButton}
          activeOpacity={0.5}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <X size={24} color="#FFF" strokeWidth={2.25} />
        </TouchableOpacity>

        <View style={styles.transport}>
          <TouchableOpacity
            onPress={handleSkipToStart}
            style={styles.transportButton}
            activeOpacity={0.6}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            accessibilityLabel={t('timeline.skipToStart', 'Skip to start')}
          >
            <SkipBack size={20} color="#FFF" strokeWidth={2.25} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handlePlayPause}
            style={styles.playButton}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            {state.isPlaying ? (
              <Pause size={22} color="#FFF" strokeWidth={2.25} />
            ) : (
              <Play size={22} color="#FFF" strokeWidth={2.25} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSkipToEnd}
            style={styles.transportButton}
            activeOpacity={0.6}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            accessibilityLabel={t('timeline.skipToEnd', 'Skip to end')}
          >
            <SkipForward size={20} color="#FFF" strokeWidth={2.25} />
          </TouchableOpacity>
        </View>

        <View
          style={styles.saveIndicator}
          accessibilityLabel={
            isSaving
              ? t('timeline.saveStatusSaving')
              : state.isDirty
                ? t('timeline.saveStatusUnsaved')
                : t('timeline.saveStatusSaved')
          }
        >
          {isSaving ? (
            <CloudUpload size={16} color="#888" strokeWidth={2.25} />
          ) : state.isDirty ? (
            <Circle size={14} color="#999" strokeWidth={2.25} />
          ) : (
            <CloudCheck size={16} color="#22C55E" strokeWidth={2.25} />
          )}
        </View>
      </View>

      {/* Position + clip count */}
      <View style={styles.positionBar}>
        <Text variant="caption" style={styles.positionText}>
          {formatTimelineMs(state.playbackPositionMs)} / {formatTimelineMs(totalDuration)}
        </Text>
        <Text variant="caption" style={styles.clipCount}>
          {state.clips.length !== 1
            ? t('timeline.clipCountPlural', { n: state.clips.length })
            : t('timeline.clipCountSingular', { n: state.clips.length })}
        </Text>
      </View>

      {/* Timeline scroll area with pinch-to-zoom.
          Structure: vertical ScrollView wraps the whole timeline so tracks
          that don't fit on screen scroll into view. Inside it, a
          horizontal ScrollView holds the ruler + clip tracks, and an
          absolute-positioned overlay holds the sticky lane mixer panels.
          The overlay lives inside the vertical scroll content so it
          scrolls vertically in sync with the tracks, but it's a sibling
          of the horizontal ScrollView so horizontal scrolling doesn't
          affect it (it stays pinned to the left). */}
      <View style={styles.timelineContainer}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <View
            style={{
              position: 'relative',
              minHeight:
                RULER_HEIGHT + tracksAreaHeight + ADD_TRACK_ROW_HEIGHT + 12,
            }}
          >
            <GestureDetector gesture={composedGesture}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{
                  width: totalWidth + LANE_LABEL_WIDTH + RULER_LEFT_GUTTER,
                  paddingLeft: LANE_LABEL_WIDTH + RULER_LEFT_GUTTER,
                  paddingRight: 40,
                }}
              >
                <View>
                  {/* Ruler */}
                  <TimelineRuler
                    totalDurationMs={totalDuration}
                    zoom={state.zoomLevel}
                    onSeek={handleSeek}
                  />

                  {/* Tracks area — tap empty space to deselect */}
                  <View
                    style={[
                      styles.tracksArea,
                      { width: totalWidth, height: tracksAreaHeight },
                    ]}
                  >
                    {/* Lane backgrounds */}
                    {Array.from({ length: state.laneCount }, (_, i) => (
                      <View
                        key={`lane-bg-${i}`}
                        pointerEvents="none"
                        style={[
                          styles.laneBackground,
                          {
                            top: i * TRACK_HEIGHT,
                            height: TRACK_HEIGHT,
                            backgroundColor: i % 2 === 0 ? '#0d0d0d' : '#111',
                          },
                          state.activeLaneIndex === i && styles.laneBackgroundActive,
                        ]}
                      />
                    ))}

                    {state.clips.map((clip) => {
                      // Neighbors on the same lane (excluding self) — used
                      // for the live wall-rule clamp during drag.
                      const sameLaneNeighbors = state.clips.filter(
                        (c) => c.laneIndex === clip.laneIndex && c.id !== clip.id
                      );
                      return (
                        <TimelineTrack
                          key={clip.id}
                          clip={clip}
                          zoom={state.zoomLevel}
                          isSelected={state.selectedClipId === clip.id}
                          onSelect={() => {
                            clearTimeout(deselectTimerRef.current);
                            selectClip(clip.id);
                          }}
                          onTrimChange={(start, end) => trimClip(clip.id, start, end)}
                          onMove={(targetLane) => moveClip(clip.id, targetLane)}
                          onMoveToPosition={(position) =>
                            moveClipToPosition(clip.id, position)
                          }
                          laneClips={sameLaneNeighbors}
                          trackHeight={TRACK_HEIGHT - LANE_PADDING}
                          laneCount={state.laneCount}
                          laneOffset={clip.laneIndex * TRACK_HEIGHT + LANE_PADDING / 2}
                          laneColor={state.laneMeta[clip.laneIndex]?.color}
                          segmentDurationMs={segmentDurationMap.get(clip.segmentId) ?? 0}
                        />
                      );
                    })}

                    {/* Live recording placeholder — grows from the
                        snapshotted start position as the recorder's
                        native duration counter ticks. Disappears as
                        soon as the real clip lands in state.clips
                        after upload. */}
                    {(isRecording || isUploadingRecording) && (
                      <View
                        pointerEvents="none"
                        style={[
                          styles.recordingPlaceholder,
                          {
                            left: msToPixels(
                              recordingStartMsRef.current,
                              state.zoomLevel
                            ),
                            width: Math.max(
                              4,
                              msToPixels(recordingElapsedMs, state.zoomLevel)
                            ),
                            top:
                              recordingLaneRef.current * TRACK_HEIGHT +
                              LANE_PADDING / 2,
                            height: TRACK_HEIGHT - LANE_PADDING,
                            backgroundColor: isUploadingRecording
                              ? 'rgba(245, 158, 11, 0.35)'
                              : 'rgba(239, 68, 68, 0.35)',
                            borderColor: isUploadingRecording
                              ? '#F59E0B'
                              : '#EF4444',
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.recordingDot,
                            isUploadingRecording && styles.recordingDotUploading,
                          ]}
                        />
                        <Text variant="caption" style={styles.recordingLabel}>
                          {isUploadingRecording
                            ? t('timeline.recordingUploading', 'Uploading…')
                            : t('timeline.recordingLive', 'REC')}
                        </Text>
                      </View>
                    )}

                    {/* Playhead */}
                    <TimelinePlayhead
                      positionMs={state.playbackPositionMs}
                      zoom={state.zoomLevel}
                      height={tracksAreaHeight + RULER_HEIGHT}
                      totalDurationMs={totalDuration}
                      onSeek={handleSeek}
                      topOffset={-RULER_HEIGHT}
                    />
                  </View>
                </View>
              </ScrollView>
            </GestureDetector>

            {/* Sticky lane mixer panels — absolute-positioned inside the
                vertical scroll content, so they scroll with tracks
                vertically but ignore horizontal scroll.
                The wrapper explicitly sets width+height so Yoga doesn't
                have to infer them from the child's intrinsic size — this
                prevents the inner container from collapsing to its
                natural content height when the wrapper itself is
                absolutely positioned. */}
            <View style={styles.laneLabelsOverlay} pointerEvents="box-none">
              {Array.from({ length: state.laneCount }, (_, i) => {
                const meta = state.laneMeta[i];
                return (
                  <View
                    key={i}
                    style={{
                      position: 'absolute',
                      top: RULER_HEIGHT + i * TRACK_HEIGHT + LANE_PADDING / 2,
                      left: 0,
                      width: LANE_LABEL_WIDTH,
                      height: TRACK_HEIGHT - LANE_PADDING,
                    }}
                  >
                    <LanePanel
                      laneIndex={i}
                      meta={meta}
                      isActive={state.activeLaneIndex === i}
                      onPress={() => setActiveLane(i)}
                      onEdit={() => handleEditLane(i)}
                      onToggleMute={() => setLaneMute(i, !(meta?.muted ?? false))}
                      onToggleSolo={() => setLaneSolo(i, !(meta?.solo ?? false))}
                      onGainChange={(gainDb) => setLaneGain(i, gainDb)}
                      onPanChange={(pan) => setLanePan(i, pan)}
                    />
                  </View>
                );
              })}
              {/* Dedicated "Add Track" row — sits below the last lane, in
                  its own row so it's never mistaken for a control of the
                  last track */}
              <TouchableOpacity
                onPress={addLane}
                activeOpacity={0.7}
                style={[
                  styles.addTrackRow,
                  {
                    top: RULER_HEIGHT + state.laneCount * TRACK_HEIGHT + 6,
                  },
                ]}
              >
                <Plus size={14} color="#888" strokeWidth={2.5} />
                <Text variant="caption" style={styles.addTrackLabel}>
                  {t('timeline.toolAddTrack')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        {state.clips.length === 0 && (
          <View style={styles.emptyOverlay} pointerEvents="none">
            <Text variant="body" style={styles.emptyText}>
              {t('timeline.emptyClips')}
            </Text>
          </View>
        )}
      </View>

      {/* Toolbar — both edit ops (row 1) and project actions (row 2) */}
      <TimelineToolbar
        onSplit={splitAtPlayhead}
        onDelete={deleteSelectedClip}
        onDuplicate={() => {
          if (state.selectedClipId) duplicateClip(state.selectedClipId);
        }}
        onUndo={undo}
        onRedo={redo}
        onExport={handleExport}
        hasSelection={state.selectedClipId !== null}
        canUndo={canUndo}
        canRedo={canRedo}
        onImport={importAudio}
        isImporting={isImporting || isUploadingRecording}
        onRecord={startRecording}
        onStopRecord={stopRecording}
        isRecording={isRecording}
        recordingElapsed={recordingElapsed}
        onVolumePress={
          state.selectedClipId ? () => setVolumeModalVisible(true) : undefined
        }
        onPublish={onPublish ? handleExport : undefined}
        isPublishing={isPublishing}
      />

      {/* Loading modal shown while audio is being uploaded — covers
          both fresh mic recordings and file-system imports. The two
          flows share the same upload pipeline (`uploadAudio`) so they
          should never overlap; if they ever do, recording wins because
          the user has more invested in it. */}
      <AudioPreparingModal
        visible={isUploadingRecording || isImporting}
        mode={isUploadingRecording ? 'recording' : 'import'}
      />

      {/* Lane edit sheet — name + color + delete */}
      <LaneEditSheet
        visible={editingLaneIndex !== null}
        laneIndex={editingLaneIndex ?? 0}
        currentMeta={editingMeta}
        hasClips={editingLaneHasClips}
        canDelete={state.laneCount > 1}
        onClose={() => setEditingLaneIndex(null)}
        onSave={handleLaneEditSave}
        onDelete={handleLaneEditDelete}
      />

      {/* Volume Modal */}
      <Modal
        visible={volumeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setVolumeModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          onPress={() => setVolumeModalVisible(false)}
        >
          <TouchableOpacity style={styles.volumeModal} onPress={() => {}}>
            <Text variant="body" style={styles.volumeModalTitle}>
              {t('timeline.volumeModalTitle')}
            </Text>
            <View style={styles.volumeSliderRow}>
              <Volume1 size={18} color="#888" strokeWidth={2.25} />
              <TouchableOpacity
                style={styles.volumeTrack}
                onPress={(e) => {
                  if (!state.selectedClipId) return;
                  const layout = e.nativeEvent.locationX;
                  const trackWidth = 220;
                  const pct = Math.max(0, Math.min(1, layout / trackWidth));
                  setVolume(state.selectedClipId, Math.round(pct * 20) / 20);
                }}
              >
                <View
                  style={[
                    styles.volumeFill,
                    {
                      width: `${(state.selectedClipId ? (state.clips.find((c) => c.id === state.selectedClipId)?.volume ?? 1) : 1) * 100}%`,
                    },
                  ]}
                />
              </TouchableOpacity>
              <Volume2 size={18} color="#888" strokeWidth={2.25} />
            </View>
            <Text variant="caption" style={styles.volumePercent}>
              {Math.round(
                (state.selectedClipId
                  ? (state.clips.find((c) => c.id === state.selectedClipId)?.volume ?? 1)
                  : 1) * 100
              )}
              %
            </Text>
            <TouchableOpacity
              style={styles.volumeDoneButton}
              onPress={() => setVolumeModalVisible(false)}
            >
              <Text variant="caption" style={styles.volumeDoneText}>
                {t('timeline.volumeDoneButton')}
              </Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Toast />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Transport controls cluster: [SkipBack] [Play] [SkipForward].
  // Centered between the close button and the save indicator.
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  transportButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveIndicator: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  positionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  positionText: {
    color: '#888',
    fontSize: 12,
    fontFamily: 'Archivo_500Medium',
  },
  clipCount: {
    color: '#555',
    fontSize: 12,
  },
  timelineContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    borderTopWidth: 1,
    borderTopColor: '#222',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    marginHorizontal: 8,
  },
  tracksArea: {
    position: 'relative',
  },
  recordingPlaceholder: {
    position: 'absolute',
    borderWidth: 1.5,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  recordingDotUploading: {
    backgroundColor: '#F59E0B',
  },
  recordingLabel: {
    color: '#FFF',
    fontSize: 10,
    fontFamily: 'Archivo_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  laneBackground: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  laneBackgroundActive: {
    borderLeftWidth: 2,
    borderLeftColor: '#3B82F6',
  },
  laneLabelsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: LANE_LABEL_WIDTH,
    bottom: 0,
    zIndex: 20,
  },
  addTrackRow: {
    position: 'absolute',
    left: 6,
    width: LANE_LABEL_WIDTH - 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: ADD_TRACK_ROW_HEIGHT,
    borderRadius: 6,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderStyle: 'dashed',
  },
  addTrackLabel: {
    color: '#888',
    fontSize: 11,
    fontFamily: 'Archivo_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyOverlay: {
    ...StyleSheet.absoluteFillObject,
    left: LANE_LABEL_WIDTH + RULER_LEFT_GUTTER,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyText: {
    color: '#444',
    textAlign: 'center',
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  volumeModal: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    width: 300,
    alignItems: 'center',
    gap: 16,
  },
  volumeModalTitle: {
    color: '#FFF',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 15,
  },
  volumeSliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  volumeTrack: {
    flex: 1,
    height: 32,
    backgroundColor: '#222',
    borderRadius: 6,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  volumeFill: {
    height: '100%',
    backgroundColor: '#FFF',
    borderRadius: 6,
  },
  volumePercent: {
    color: '#FFF',
    fontSize: 20,
    lineHeight: 28,
    fontFamily: 'Archivo_600SemiBold',
  },
  volumeDoneButton: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 32,
  },
  volumeDoneText: {
    color: '#000',
    fontSize: 14,
    fontFamily: 'Archivo_600SemiBold',
  },
});
