import { useRef, useState, useMemo } from 'react';
import { View, StyleSheet, PanResponder } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { WaveformView } from './WaveformView';
import { msToPixels, pixelsToMs, clipDurationMs } from '../utils/timelineCalculations';
import type { LocalClip } from '../types';

const MIN_CLIP_MS = 500;
const CLIP_GAP_PX = 2;

interface TimelineTrackProps {
  clip: LocalClip;
  zoom: number;
  isSelected: boolean;
  onSelect: () => void;
  onTrimChange?: (startInSegment: number, endInSegment: number) => void;
  onMove?: (targetLane: number) => void;
  trackHeight: number;
  laneCount: number;
  laneOffset?: number;
  laneColor?: string;
  segmentDurationMs: number;
}

export function TimelineTrack({
  clip,
  zoom,
  isSelected,
  onSelect,
  onTrimChange,
  onMove,
  trackHeight,
  laneCount,
  laneOffset = 0,
  laneColor,
  segmentDurationMs,
}: TimelineTrackProps) {
  const duration = clipDurationMs(clip.startInSegment, clip.endInSegment);
  const rawWidth = msToPixels(duration, zoom);
  const rawLeft = msToPixels(clip.positionInTimeline, zoom);
  // Add visual gap between clips (offset by order index)
  const gap = clip.order > 0 ? CLIP_GAP_PX : 0;
  const width = Math.max(rawWidth - gap, 4);
  const left = rawLeft + gap;
  const waveformHeight = trackHeight - 8;

  const [isDragging, setIsDragging] = useState(false);
  const [dragOffsetY, setDragOffsetY] = useState(0);

  const trimRef = useRef({ start: clip.startInSegment, end: clip.endInSegment });
  trimRef.current = { start: clip.startInSegment, end: clip.endInSegment };
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const onTrimRef = useRef(onTrimChange);
  onTrimRef.current = onTrimChange;
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const clipRef = useRef(clip);
  clipRef.current = clip;
  const trackHeightRef = useRef(trackHeight);
  trackHeightRef.current = trackHeight;
  const laneCountRef = useRef(laneCount);
  laneCountRef.current = laneCount;

  const leftPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => {
        if (!onTrimRef.current) return;
        const deltaMs = pixelsToMs(g.dx, zoomRef.current);
        const newStart = Math.max(
          0,
          Math.min(trimRef.current.start + deltaMs, trimRef.current.end - MIN_CLIP_MS)
        );
        onTrimRef.current(Math.round(newStart), trimRef.current.end);
      },
      onPanResponderRelease: () => {},
    })
  ).current;

  const rightPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => {
        if (!onTrimRef.current) return;
        const deltaMs = pixelsToMs(g.dx, zoomRef.current);
        const newEnd = Math.max(
          trimRef.current.start + MIN_CLIP_MS,
          trimRef.current.end + deltaMs
        );
        onTrimRef.current(trimRef.current.start, Math.round(newEnd));
      },
      onPanResponderRelease: () => {},
    })
  ).current;

  // Tap to select
  const tapGesture = useMemo(
    () =>
      Gesture.Tap()
        .runOnJS(true)
        .onEnd(() => {
          onSelect();
        }),
    [onSelect]
  );

  // Long press + drag to move between lanes
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activateAfterLongPress(300)
        .onStart(() => {
          setIsDragging(true);
          setDragOffsetY(0);
        })
        .onUpdate((e) => {
          setDragOffsetY(e.translationY);
        })
        .onEnd((e) => {
          const laneDelta = Math.round(e.translationY / trackHeightRef.current);
          const targetLane = Math.max(
            0,
            Math.min(laneCountRef.current - 1, clipRef.current.laneIndex + laneDelta)
          );
          if (targetLane !== clipRef.current.laneIndex) {
            onMoveRef.current?.(targetLane);
          }
          setIsDragging(false);
          setDragOffsetY(0);
        })
        .onFinalize(() => {
          setIsDragging(false);
          setDragOffsetY(0);
        }),
    []
  );

  const composedGesture = useMemo(
    () => Gesture.Race(panGesture, tapGesture),
    [panGesture, tapGesture]
  );

  return (
    <GestureDetector gesture={composedGesture}>
      <View
        style={[
          styles.track,
          {
            width: Math.max(width, 4),
            height: trackHeight,
            left,
            top: laneOffset,
            borderColor: laneColor ?? '#444',
          },
          isSelected && styles.selected,
          isDragging && {
            opacity: 0.7,
            transform: [{ translateY: dragOffsetY }],
            zIndex: 100,
            borderColor: '#FFF',
            borderWidth: 2,
          },
        ]}
      >
        <WaveformView
          segmentId={clip.segmentId}
          width={Math.max(width - 8, 10)}
          height={waveformHeight}
          color={isSelected ? '#FFF' : (laneColor ?? '#999')}
          trimStart={segmentDurationMs > 0 ? clip.startInSegment / segmentDurationMs : 0}
          trimEnd={segmentDurationMs > 0 ? clip.endInSegment / segmentDurationMs : 1}
        />
        {isSelected && !isDragging && (
          <>
            <View
              style={[styles.handle, styles.handleLeft]}
              {...leftPanResponder.panHandlers}
            >
              <View style={styles.handleGrip} />
            </View>
            <View
              style={[styles.handle, styles.handleRight]}
              {...rightPanResponder.panHandlers}
            >
              <View style={styles.handleGrip} />
            </View>
          </>
        )}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  track: {
    position: 'absolute',
    top: 0,
    backgroundColor: '#333',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#444',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    overflow: 'hidden',
  },
  selected: {
    borderColor: '#FFFFFF',
    borderWidth: 2,
  },
  handle: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  handleLeft: {
    left: 0,
  },
  handleRight: {
    right: 0,
  },
  handleGrip: {
    width: 2,
    height: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: 1,
  },
});
