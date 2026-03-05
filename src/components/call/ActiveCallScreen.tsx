import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Alert,
  ActivityIndicator,
  Pressable,
  Modal,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { Toast, showToast } from '@/components/ui/Toast';
import { TimelineRuler } from '@/features/timeline/components/TimelineRuler';
import { TimelineTrack } from '@/features/timeline/components/TimelineTrack';
import { TimelinePlayhead } from '@/features/timeline/components/TimelinePlayhead';
import { TimelineToolbar } from '@/features/timeline/components/TimelineToolbar';
import { useTimeline } from '@/features/timeline/hooks/useTimeline';
import { useTimelinePlayback } from '@/features/timeline/hooks/useTimelinePlayback';
import { useImportAudio } from '@/features/timeline/hooks/useImportAudio';
import { serverClipToLocal, clipToInput } from '@/features/timeline/types';
import type { LaneMeta } from '@/features/timeline/types';
import type { LaneMetadata } from '@/types/project';
import { getTimelineDuration } from '@/features/timeline/utils/clipOperations';
import {
  msToPixels,
  formatTimelineMs,
} from '@/features/timeline/utils/timelineCalculations';
import { useQueryClient } from '@tanstack/react-query';
import { useCallStore } from '@/stores/callStore';
import { useProjectDetail } from '@/features/projects/hooks/useProjectDetail';
import { telephonyService } from '@/lib/api/telephonyService';
import { projectService } from '@/lib/api/projectService';
import { hangUpCall, toggleMuteCall, toggleSpeaker } from '@/hooks/useTwilioVoice';
import type { AudioSegment } from '@/types/call';
import type { LocalClip } from '@/features/timeline/types';

interface ActiveCallScreenProps {
  onBack: () => void;
}

const TRACK_HEIGHT = 56;
const LANE_PADDING = 4;
const RULER_HEIGHT = 28;
const LANE_LABEL_WIDTH = 34;

export function ActiveCallScreen({ onBack }: ActiveCallScreenProps) {
  const queryClient = useQueryClient();
  const activeCall = useCallStore((s) => s.activeCall);
  const activeProjectId = useCallStore((s) => s.activeProjectId);
  const { startCapture, stopCapture } = useCallStore();
  const insets = useSafeAreaInsets();

  // Invalidate project cache on unmount so other screens get fresh data
  const projectIdRef = useRef(activeProjectId);
  projectIdRef.current = activeProjectId;
  useEffect(() => {
    return () => {
      if (projectIdRef.current) {
        queryClient.invalidateQueries({ queryKey: ['project', projectIdRef.current] });
      }
    };
  }, [queryClient]);

  // Call timer
  const [callElapsed, setCallElapsed] = useState(0);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Saving state
  const [isSaving, setIsSaving] = useState(false);

  // Local segments list (grows as we record)
  const [localSegments, setLocalSegments] = useState<
    (AudioSegment & { downloadUrl: string })[]
  >([]);

  // Project data
  const { data: projectData, isLoading: isProjectLoading } = useProjectDetail(
    activeProjectId ?? ''
  );

  // Initial clips from project
  const initialClips = useMemo(() => {
    if (!projectData) return [];
    return projectData.clips.map(serverClipToLocal);
  }, [projectData]);

  // Convert server lanes to numeric keys
  const initialLaneMeta = useMemo(() => {
    const lanes = (projectData?.project as { lanes?: Record<string, LaneMetadata> })
      ?.lanes;
    if (!lanes) return undefined;
    const meta: Record<number, LaneMeta> = {};
    for (const [key, val] of Object.entries(lanes)) {
      meta[Number(key)] = val;
    }
    return meta;
  }, [projectData]);

  // Timeline
  const {
    state,
    setClips,
    addClip,
    selectClip,
    splitAtPlayhead,
    deleteSelectedClip,
    trimClip,
    setPlaybackPosition,
    setPlaying,
    setZoom,
    markClean,
    setActiveLane,
    addLane,
    moveClip,
    removeLane,
    setLaneMeta,
    setVolume,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useTimeline(initialClips, initialLaneMeta);

  const [volumeModalVisible, setVolumeModalVisible] = useState(false);

  const { importAudio: rawImportAudio, isImporting } = useImportAudio({
    projectId: activeProjectId ?? '',
    activeLaneIndex: state.activeLaneIndex,
    addClip,
  });

  // Wrap import to also refresh segments (useImportAudio only adds the clip,
  // not the segment with its downloadUrl).
  const importAudio = useCallback(async () => {
    await rawImportAudio();
    if (activeProjectId) {
      try {
        const fresh = await projectService.getProject(activeProjectId);
        setLocalSegments((prev) => {
          const freshIds = new Set(fresh.segments.map((s) => s.id));
          const kept = prev.filter((s) => !freshIds.has(s.id));
          return [...kept, ...fresh.segments];
        });
      } catch {
        // best-effort
      }
    }
  }, [rawImportAudio, activeProjectId]);

  // Sync project data when it loads
  const didInit = useRef(false);
  useEffect(() => {
    if (projectData && !didInit.current) {
      didInit.current = true;
      const clips = projectData.clips.map(serverClipToLocal);
      setClips(clips);
      setLocalSegments(projectData.segments);

      // Resolve orphaned segments: clips that reference segments not in
      // projectData.segments (e.g. addSegment failed in a previous session).
      // Re-link them to the project, then refetch to get their downloadUrls.
      if (activeProjectId) {
        const segIds = new Set(projectData.segments.map((s) => s.id));
        const orphanIds = [...new Set(clips.map((c) => c.segmentId))].filter(
          (id) => !segIds.has(id)
        );
        if (orphanIds.length > 0) {
          (async () => {
            await Promise.allSettled(
              orphanIds.map((id) => projectService.addSegment(activeProjectId, id))
            );
            try {
              const fresh = await projectService.getProject(activeProjectId);
              setLocalSegments((prev) => {
                const freshIds = new Set(fresh.segments.map((s) => s.id));
                const kept = prev.filter((s) => !freshIds.has(s.id));
                return [...kept, ...fresh.segments];
              });
            } catch {
              // best-effort
            }
          })();
        }
      }
    }
  }, [projectData, setClips, activeProjectId]);

  // Playback
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

  // Pinch-to-zoom
  const zoomRef = useRef(state.zoomLevel);
  zoomRef.current = state.zoomLevel;
  const baseZoomRef = useRef(1);

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

  // Call timer
  useEffect(() => {
    if (!activeCall?.connectedAt) return;
    const interval = setInterval(() => {
      setCallElapsed(Math.floor((Date.now() - activeCall.connectedAt!.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeCall?.connectedAt]);

  // Recording timer
  useEffect(() => {
    if (!isRecording) return;
    const start = Date.now();
    const interval = setInterval(() => {
      setRecordingElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isRecording]);

  // Pulsing animation for recording
  useEffect(() => {
    if (!isRecording) {
      pulseAnim.setValue(1);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [isRecording, pulseAnim]);

  // ─── Handlers ───

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

  const handleStartRecording = useCallback(async () => {
    if (!activeCall) return;
    try {
      const { streamSid } = await telephonyService.startCapture(activeCall.callSid);
      startCapture(streamSid);
      setRecordingElapsed(0);
      setIsRecording(true);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      Alert.alert('Recording failed', msg);
    }
  }, [activeCall, startCapture]);

  const handleStopRecording = useCallback(async () => {
    if (!activeCall) return;

    // Capture baseline BEFORE stopping the stream to avoid the race condition
    // where the segment is already saved by the time we fetch the baseline.
    let baselineCount = 0;
    try {
      const current = await telephonyService.getSegments(activeCall.callSid);
      baselineCount = current.length;
    } catch {
      // If this fails, 0 is safe — any segment found will be treated as new
    }

    // Stop the capture stream
    if (activeCall.activeStreamSid) {
      try {
        await telephonyService.stopCapture(
          activeCall.callSid,
          activeCall.activeStreamSid
        );
      } catch {
        // Stream may have already ended
      }
    }
    stopCapture();
    setIsRecording(false);
    setIsProcessing(true);

    // Poll for the new segment (backend needs time to process audio)
    const maxRetries = 10;
    const retryDelayMs = 2000;
    for (let i = 0; i < maxRetries; i++) {
      await new Promise((r) => setTimeout(r, retryDelayMs));
      try {
        const allSegments = await telephonyService.getSegments(activeCall.callSid);
        if (allSegments.length > baselineCount) {
          const newSegment = allSegments[allSegments.length - 1];

          // Link segment to project (retry up to 3 times)
          if (activeProjectId) {
            let linked = false;
            for (let attempt = 0; attempt < 3 && !linked; attempt++) {
              try {
                await projectService.addSegment(activeProjectId, newSegment.id);
                linked = true;
                queryClient.invalidateQueries({ queryKey: ['project', activeProjectId] });
                queryClient.invalidateQueries({ queryKey: ['projects'] });
              } catch (e: unknown) {
                if (attempt < 2) {
                  await new Promise((r) => setTimeout(r, 1000));
                } else {
                  const m = e instanceof Error ? e.message : String(e);
                  showToast(`Could not link to project: ${m}`);
                }
              }
            }
          }

          // Merge new call segments with existing project segments
          // (don't replace — project may have segments from other calls/imports)
          setLocalSegments((prev) => {
            const newIds = new Set(allSegments.map((s) => s.id));
            const kept = prev.filter((s) => !newIds.has(s.id));
            return [...kept, ...allSegments];
          });

          // Add clip to timeline optimistically on active lane
          const newClip: LocalClip = {
            id:
              'clip_' +
              Date.now().toString(36) +
              '_' +
              Math.random().toString(36).slice(2, 9),
            segmentId: newSegment.id,
            startInSegment: 0,
            endInSegment: newSegment.durationMs || recordingElapsed * 1000,
            positionInTimeline: 0,
            order: state.clips.filter((c) => c.laneIndex === state.activeLaneIndex)
              .length,
            volume: 1.0,
            laneIndex: state.activeLaneIndex,
          };
          addClip(newClip);

          setIsProcessing(false);
          showToast('Recording added to timeline');
          return;
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        if (i === maxRetries - 1) {
          setIsProcessing(false);
          Alert.alert('Error', `Could not load recording: ${msg}`);
          return;
        }
      }
    }
    // All retries exhausted — segment not found
    setIsProcessing(false);
    Alert.alert(
      'Recording Not Found',
      'The recording was saved on the server but could not be loaded. Try refreshing the project.',
      [{ text: 'OK' }]
    );
  }, [
    activeCall,
    activeProjectId,
    recordingElapsed,
    state.clips,
    state.activeLaneIndex,
    stopCapture,
    addClip,
    queryClient,
  ]);

  // Autosave: debounced 2s after any edit.
  // Refs track current state so we can detect if edits happened during save.
  const savingRef = useRef(false);
  const currentClipsRef = useRef(state.clips);
  currentClipsRef.current = state.clips;
  const currentLaneMetaRef = useRef(state.laneMeta);
  currentLaneMetaRef.current = state.laneMeta;

  useEffect(() => {
    if (!state.isDirty || isSaving || !activeProjectId) return;
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
          projectService.saveTimeline(activeProjectId, clipsSnapshot.map(clipToInput)),
          projectService.updateProject(activeProjectId, { lanes: lanesPayload }),
        ]);
        // Only mark clean if state hasn't changed during the async save
        if (
          currentClipsRef.current === clipsSnapshot &&
          currentLaneMetaRef.current === lanesSnapshot
        ) {
          markClean();
          queryClient.invalidateQueries({ queryKey: ['project', activeProjectId] });
        }
      } catch {
        showToast('Autosave failed');
      } finally {
        savingRef.current = false;
        setIsSaving(false);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [state.isDirty, state.clips, state.laneMeta, activeProjectId, markClean, isSaving]);

  const flushSave = useCallback(async () => {
    if (!activeProjectId) return;
    // Wait for any in-flight autosave to finish
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
        projectService.saveTimeline(activeProjectId, state.clips.map(clipToInput)),
        projectService.updateProject(activeProjectId, { lanes: lanesPayload }),
      ]);
      markClean();
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [activeProjectId, state.clips, state.laneMeta, markClean]);

  const handleExport = useCallback(async () => {
    if (!activeProjectId) return;
    if (state.clips.length === 0) {
      showToast('No clips to export');
      return;
    }
    try {
      await flushSave();
      const result = await projectService.exportProject(activeProjectId);
      Alert.alert(
        'Export Complete',
        `Audio exported (${Math.round(result.fileSizeBytes / 1024)}KB)`,
        [{ text: 'OK' }]
      );
    } catch {
      showToast('Export failed');
    }
  }, [activeProjectId, state.clips, flushSave]);

  const handleBack = useCallback(async () => {
    if (state.isDirty) {
      try {
        await flushSave();
      } catch {
        // Best-effort save before leaving
      }
    }
    onBack();
  }, [state.isDirty, flushSave, onBack]);

  const handleHangUp = useCallback(async () => {
    if (state.isDirty) {
      try {
        await flushSave();
      } catch {
        // Best-effort save before hanging up
      }
    }
    hangUpCall();
    onBack();
  }, [state.isDirty, flushSave, onBack]);

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

  const handleEditLane = useCallback(
    (laneIndex: number) => {
      const current = state.laneMeta[laneIndex];
      Alert.prompt(
        'Lane Name',
        `Enter a name for lane ${laneIndex + 1}`,
        (text) => {
          if (text !== undefined) {
            setLaneMeta(laneIndex, {
              name: text,
              color: current?.color ?? '#3B82F6',
            });
          }
        },
        'plain-text',
        current?.name ?? ''
      );
    },
    [state.laneMeta, setLaneMeta]
  );

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  if (!activeCall) return null;

  const playPosition = state.playbackPositionMs;

  return (
    <View style={styles.container}>
      {/* Header: call info + controls */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={handleBack} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text variant="body" style={styles.headerTitle}>
            ATT
            <Text variant="body" style={styles.headerO}>
              O
            </Text>
          </Text>
          <Text variant="caption" style={styles.callTimerText}>
            {formatTime(callElapsed)}
          </Text>
        </View>

        <TouchableOpacity onPress={handlePlayPause} style={styles.headerPlayButton}>
          <Ionicons name={state.isPlaying ? 'pause' : 'play'} size={20} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Call controls row */}
      <View style={styles.callControlsRow}>
        <TouchableOpacity style={styles.callControl} onPress={toggleMuteCall}>
          <Ionicons
            name={activeCall.isMuted ? 'mic-off' : 'mic'}
            size={20}
            color={activeCall.isMuted ? '#EF4444' : '#FFF'}
          />
          <Text variant="caption" style={styles.callControlLabel}>
            {activeCall.isMuted ? 'Unmute' : 'Mute'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.callControl} onPress={toggleSpeaker}>
          <Ionicons
            name={activeCall.isSpeaker ? 'volume-high' : 'volume-low'}
            size={20}
            color={activeCall.isSpeaker ? '#3B82F6' : '#FFF'}
          />
          <Text variant="caption" style={styles.callControlLabel}>
            Speaker
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.hangUpButton} onPress={handleHangUp}>
          <Ionicons name="call" size={18} color="#FFF" style={styles.hangUpIcon} />
          <Text variant="caption" style={styles.hangUpLabel}>
            End
          </Text>
        </TouchableOpacity>
      </View>

      {/* Recording indicator */}
      {isRecording && (
        <Animated.View style={[styles.recordingBanner, { opacity: pulseAnim }]}>
          <View style={styles.recordingDot} />
          <Text variant="caption" style={styles.recordingText}>
            Recording {formatTime(recordingElapsed)}
          </Text>
        </Animated.View>
      )}

      {isProcessing && (
        <View style={styles.processingBanner}>
          <ActivityIndicator size="small" color="#3B82F6" />
          <Text variant="caption" style={styles.processingText}>
            Processing recording...
          </Text>
        </View>
      )}

      {/* Position display */}
      <View style={styles.positionBar}>
        <Text variant="caption" style={styles.positionText}>
          {formatTimelineMs(playPosition)} / {formatTimelineMs(totalDuration)}
        </Text>
        <Text variant="caption" style={styles.clipCount}>
          {state.clips.length} clip{state.clips.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* Timeline scroll area with pinch-to-zoom */}
      <View style={styles.timelineContainer}>
        {isProjectLoading ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#3B82F6" />
          </View>
        ) : (
          <GestureDetector gesture={pinchGesture}>
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

                {/* Tracks area */}
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
                      onSelect={() => selectClip(clip.id)}
                      onTrimChange={(start, end) => trimClip(clip.id, start, end)}
                      onMove={(targetLane) => moveClip(clip.id, targetLane)}
                      trackHeight={TRACK_HEIGHT - LANE_PADDING}
                      laneCount={state.laneCount}
                      laneOffset={clip.laneIndex * TRACK_HEIGHT + LANE_PADDING / 2}
                      laneColor={state.laneMeta[clip.laneIndex]?.color}
                      segmentDurationMs={0}
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
        )}

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

        {state.clips.length === 0 && !isProjectLoading && (
          <View style={styles.emptyOverlay}>
            <Ionicons name="musical-notes-outline" size={32} color="#333" />
            <Text variant="body" style={styles.emptyText}>
              Tap Record to capture audio
            </Text>
          </View>
        )}
      </View>

      {/* Toolbar with Record + editing tools */}
      <View style={{ paddingBottom: insets.bottom }}>
        <TimelineToolbar
          onSplit={splitAtPlayhead}
          onDelete={deleteSelectedClip}
          onUndo={undo}
          onRedo={redo}
          onExport={handleExport}
          hasSelection={state.selectedClipId !== null}
          canUndo={canUndo}
          canRedo={canRedo}
          isRecording={isRecording}
          onRecord={handleStartRecording}
          onStopRecord={handleStopRecording}
          recordingElapsed={recordingElapsed}
          onImport={importAudio}
          isImporting={isImporting}
          onVolumePress={
            state.selectedClipId ? () => setVolumeModalVisible(true) : undefined
          }
        />
      </View>

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
    </View>
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
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
  },
  headerO: {
    color: '#FFF',
    fontSize: 16,
    fontFamily: 'Poppins_700Bold',
  },
  callTimerText: {
    color: '#666',
    fontSize: 11,
    fontFamily: 'Poppins_400Regular',
  },
  headerPlayButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callControlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  callControl: {
    alignItems: 'center',
    gap: 2,
  },
  callControlLabel: {
    color: '#888',
    fontSize: 10,
    fontFamily: 'Poppins_400Regular',
  },
  hangUpButton: {
    alignItems: 'center',
    gap: 2,
  },
  hangUpIcon: {
    transform: [{ rotate: '135deg' }],
    color: '#EF4444',
  },
  hangUpLabel: {
    color: '#EF4444',
    fontSize: 10,
    fontFamily: 'Poppins_500Medium',
  },
  recordingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  recordingText: {
    color: '#EF4444',
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
  },
  processingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    gap: 8,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  processingText: {
    color: '#3B82F6',
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
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
  loadingOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 8,
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
