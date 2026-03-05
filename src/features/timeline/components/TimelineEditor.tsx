import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Pressable, Alert, Modal } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { Toast, showToast } from '@/components/ui/Toast';
import { TimelineRuler } from './TimelineRuler';
import { TimelineTrack } from './TimelineTrack';
import { TimelinePlayhead } from './TimelinePlayhead';
import { TimelineToolbar } from './TimelineToolbar';
import { useTimeline } from '../hooks/useTimeline';
import { useTimelinePlayback } from '../hooks/useTimelinePlayback';
import { useImportAudio } from '../hooks/useImportAudio';
import { serverClipToLocal, clipToInput } from '../types';
import { getTimelineDuration } from '../utils/clipOperations';
import { msToPixels, formatTimelineMs } from '../utils/timelineCalculations';
import { projectService } from '@/lib/api/projectService';
import type { LaneMeta } from '../types';
import type { TimelineClip, LaneMetadata } from '@/types/project';
import type { AudioSegment } from '@/types/call';

interface TimelineEditorProps {
  projectId: string;
  clips: TimelineClip[];
  segments: (AudioSegment & { downloadUrl: string })[];
  lanes?: Record<string, LaneMetadata>;
  onClose: () => void;
}

const TRACK_HEIGHT = 56;
const LANE_PADDING = 4;
const RULER_HEIGHT = 28;
const LANE_LABEL_WIDTH = 34;

export function TimelineEditor({
  projectId,
  clips: serverClips,
  segments,
  lanes: serverLanes,
  onClose,
}: TimelineEditorProps) {
  const initialClips = useMemo(() => serverClips.map(serverClipToLocal), [serverClips]);

  // Local segments state so we can update after import or orphan resolution
  const [localSegments, setLocalSegments] = useState(segments ?? []);
  useEffect(() => {
    if (segments) setLocalSegments(segments);
  }, [segments]);

  // Resolve orphaned segments: clips that reference segments not in the list.
  // Re-link them to the project, then refetch to get their downloadUrls.
  const didResolveOrphans = useRef(false);
  useEffect(() => {
    if (didResolveOrphans.current || localSegments.length === 0 || initialClips.length === 0)
      return;
    const segIds = new Set(localSegments.map((s) => s.id));
    const orphanIds = [...new Set(initialClips.map((c) => c.segmentId))].filter(
      (id) => !segIds.has(id)
    );
    if (orphanIds.length === 0) return;
    didResolveOrphans.current = true;
    (async () => {
      await Promise.allSettled(
        orphanIds.map((id) => projectService.addSegment(projectId, id))
      );
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
    })();
  }, [localSegments, initialClips, projectId]);

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
    removeLane,
    setLaneMeta,
  } = useTimeline(initialClips, initialLaneMeta);

  const [isSaving, setIsSaving] = useState(false);
  const [volumeModalVisible, setVolumeModalVisible] = useState(false);

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

  useTimelinePlayback({
    clips: state.clips,
    segments: localSegments,
    playbackPositionMs: state.playbackPositionMs,
    isPlaying: state.isPlaying,
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
  const deselectTimerRef = useRef<ReturnType<typeof setTimeout>>();

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
        showToast('Autosave failed');
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
      showToast('No clips to export');
      return;
    }

    try {
      await flushSave();
      const result = await projectService.exportProject(projectId);
      Alert.alert(
        'Export Complete',
        `Audio exported (${Math.round(result.fileSizeBytes / 1024)}KB)`,
        [{ text: 'OK' }]
      );
    } catch {
      showToast('Export failed');
    }
  }, [projectId, state.clips, flushSave]);

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
        showToast('Remove clips from this lane first');
        return;
      }
      removeLane(laneIndex);
    },
    [state.clips, removeLane]
  );

  const LANE_COLORS = [
    { label: 'Blue', value: '#3B82F6' },
    { label: 'Red', value: '#EF4444' },
    { label: 'Green', value: '#22C55E' },
    { label: 'Purple', value: '#A855F7' },
    { label: 'Orange', value: '#F97316' },
    { label: 'Pink', value: '#EC4899' },
  ];

  const handleEditLane = useCallback(
    (laneIndex: number) => {
      const current = state.laneMeta[laneIndex];
      Alert.prompt(
        'Lane Name',
        `Enter a name for lane ${laneIndex + 1}`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Next',
            onPress: (text) => {
              const name = text ?? current?.name ?? '';
              Alert.alert(
                'Lane Color',
                `Choose a color for "${name || `Lane ${laneIndex + 1}`}"`,
                [
                  ...LANE_COLORS.map((c) => ({
                    text: `${current?.color === c.value ? '● ' : ''}${c.label}`,
                    onPress: () => setLaneMeta(laneIndex, { name, color: c.value }),
                  })),
                  { text: 'Cancel', style: 'cancel' },
                ]
              );
            },
          },
        ],
        'plain-text',
        current?.name ?? ''
      );
    },
    [state.laneMeta, setLaneMeta]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleClose} style={styles.closeButton}>
          <Ionicons name="close" size={24} color="#FFF" />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text variant="body" style={styles.headerTitle}>
            Timeline Editor
          </Text>
          <View style={styles.saveStatus}>
            <Ionicons
              name={
                isSaving
                  ? 'cloud-upload-outline'
                  : state.isDirty
                    ? 'ellipse'
                    : 'cloud-done-outline'
              }
              size={10}
              color={isSaving ? '#888' : state.isDirty ? '#999' : '#FFF'}
            />
            <Text variant="caption" style={styles.saveStatusText}>
              {isSaving ? 'Saving...' : state.isDirty ? 'Unsaved' : 'Saved'}
            </Text>
          </View>
        </View>
        <Pressable onPress={handlePlayPause} style={styles.playButton}>
          <Ionicons name={state.isPlaying ? 'pause' : 'play'} size={22} color="#FFF" />
        </Pressable>
      </View>

      {/* Position display */}
      <View style={styles.positionBar}>
        <Text variant="caption" style={styles.positionText}>
          {formatTimelineMs(state.playbackPositionMs)} / {formatTimelineMs(totalDuration)}
        </Text>
        <Text variant="caption" style={styles.clipCount}>
          {state.clips.length} clip{state.clips.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* Timeline scroll area with pinch-to-zoom */}
      <View style={styles.timelineContainer}>
        <GestureDetector gesture={composedGesture}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              width: totalWidth + LANE_LABEL_WIDTH,
              paddingLeft: LANE_LABEL_WIDTH,
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

                {state.clips.map((clip) => (
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
                    trackHeight={TRACK_HEIGHT - LANE_PADDING}
                    laneCount={state.laneCount}
                    laneOffset={clip.laneIndex * TRACK_HEIGHT + LANE_PADDING / 2}
                    laneColor={state.laneMeta[clip.laneIndex]?.color}
                    segmentDurationMs={segmentDurationMap.get(clip.segmentId) ?? 0}
                  />
                ))}

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

        {/* Sticky lane labels overlay */}
        <View style={styles.laneLabelsOverlay} pointerEvents="box-none">
          {Array.from({ length: state.laneCount }, (_, i) => {
            const meta = state.laneMeta[i];
            const color = meta?.color ?? '#555';
            return (
              <Pressable
                key={i}
                onPress={() => {
                  setActiveLane(i);
                  handleEditLane(i);
                }}
                onLongPress={() => handleRemoveLane(i)}
                style={[
                  styles.stickyLaneLabel,
                  { top: RULER_HEIGHT + i * TRACK_HEIGHT + LANE_PADDING / 2 },
                  state.activeLaneIndex === i && styles.stickyLaneLabelActive,
                ]}
              >
                <View style={[styles.laneColorDot, { backgroundColor: color }]} />
                <Text
                  variant="caption"
                  style={[
                    styles.laneLabelText,
                    state.activeLaneIndex === i && styles.laneLabelTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {meta?.name || String(i + 1)}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={addLane}
            style={[
              styles.stickyAddButton,
              { top: RULER_HEIGHT + state.laneCount * TRACK_HEIGHT + LANE_PADDING / 2 },
            ]}
          >
            <Ionicons name="add" size={14} color="#666" />
          </Pressable>
        </View>

        {state.clips.length === 0 && (
          <View style={styles.emptyOverlay}>
            <Text variant="body" style={styles.emptyText}>
              No clips yet. Segments will appear as clips when added.
            </Text>
          </View>
        )}
      </View>

      {/* Toolbar */}
      <TimelineToolbar
        onSplit={splitAtPlayhead}
        onDelete={deleteSelectedClip}
        onUndo={undo}
        onRedo={redo}
        onExport={handleExport}
        hasSelection={state.selectedClipId !== null}
        canUndo={canUndo}
        canRedo={canRedo}
        onImport={importAudio}
        isImporting={isImporting}
        onVolumePress={
          state.selectedClipId ? () => setVolumeModalVisible(true) : undefined
        }
      />

      {/* Volume Modal */}
      <Modal
        visible={volumeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setVolumeModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setVolumeModalVisible(false)}
        >
          <Pressable style={styles.volumeModal} onPress={() => {}}>
            <Text variant="body" style={styles.volumeModalTitle}>
              Clip Volume
            </Text>
            <View style={styles.volumeSliderRow}>
              <Ionicons name="volume-low" size={18} color="#888" />
              <Pressable
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
              </Pressable>
              <Ionicons name="volume-high" size={18} color="#888" />
            </View>
            <Text variant="caption" style={styles.volumePercent}>
              {Math.round(
                (state.selectedClipId
                  ? (state.clips.find((c) => c.id === state.selectedClipId)?.volume ?? 1)
                  : 1) * 100
              )}
              %
            </Text>
            <Pressable
              style={styles.volumeDoneButton}
              onPress={() => setVolumeModalVisible(false)}
            >
              <Text variant="caption" style={styles.volumeDoneText}>
                Done
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
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
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFF',
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 16,
  },
  saveStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  saveStatusText: {
    color: '#FFF',
    fontSize: 10,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#222',
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
    fontFamily: 'Poppins_500Medium',
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
    bottom: 0,
    width: LANE_LABEL_WIDTH,
    zIndex: 20,
  },
  stickyLaneLabel: {
    position: 'absolute',
    left: 2,
    width: 28,
    height: TRACK_HEIGHT - LANE_PADDING,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#222',
  },
  stickyLaneLabelActive: {
    borderColor: '#3B82F6',
    backgroundColor: '#111',
  },
  laneColorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginBottom: 2,
  },
  laneLabelText: {
    color: '#555',
    fontSize: 8,
    fontFamily: 'Poppins_500Medium',
  },
  laneLabelTextActive: {
    color: '#3B82F6',
  },
  stickyAddButton: {
    position: 'absolute',
    left: 2,
    width: 28,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#222',
  },
  emptyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
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
    fontFamily: 'Poppins_600SemiBold',
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
    fontFamily: 'Poppins_600SemiBold',
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
    fontFamily: 'Poppins_600SemiBold',
  },
});
