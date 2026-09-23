import {
  createElement,
  forwardRef,
  useImperativeHandle,
  useRef,
  type Component,
  type ComponentType,
  type Ref,
} from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import { requireNativeViewManager, requireOptionalNativeModule } from 'expo-modules-core';

/**
 * Native audio editor timeline (iOS only). The ruler, lanes, waveforms,
 * selection and playhead are drawn and gestured in Swift; JS keeps the
 * editor state and receives every gesture as an event.
 *
 * All times are milliseconds, all lengths are points.
 */

export interface TimelineTrack {
  id: string;
  /** Lane height in points. */
  height: number;
}

export interface TimelineClip {
  id: string;
  trackIndex: number;
  startMs: number;
  durationMs: number;
  /**
   * Mono peaks in 0..1 spread evenly across the clip (200 to 4000 values).
   * May be empty while loading: the clip then shows a thin centre line.
   */
  peaks: number[];
  selected?: boolean;
  muted?: boolean;
  /** The lane's colour (hex); the waveform and border take it. Absent = palette waveform. */
  color?: string;
}

export interface TimelineSelection {
  trackIndex: number;
  startMs: number;
  endMs: number;
}

/** Hex strings with optional alpha (#RGB, #RGBA, #RRGGBB, #RRGGBBAA). */
export interface TimelineColors {
  background?: string;
  laneBackground?: string;
  laneBorder?: string;
  waveform?: string;
  waveformSelected?: string;
  playhead?: string;
  selectionLine?: string;
  selectionFill?: string;
  selectionBorder?: string;
  rulerText?: string;
  rulerTick?: string;
  clipBorder?: string;
  /** Optional: clip box fill, derived from laneBackground when absent. */
  clipFill?: string;
  /** Optional: ruler background, defaults to background. */
  rulerBackground?: string;
}

export type TimelineGesturePhase = 'begin' | 'update' | 'end';

export interface TimelineTapEvent {
  trackIndex: number;
  ms: number;
  clipId: string | null;
  /** Touch location relative to the view, in points. */
  x: number;
  y: number;
}

export interface TimelineDoubleTapEvent {
  trackIndex: number;
  ms: number;
  clipId: string | null;
}

export interface TimelineSelectionChangeEvent {
  trackIndex: number;
  startMs: number;
  endMs: number;
  phase: TimelineGesturePhase;
}

export interface TimelineClipMoveEvent {
  clipId: string;
  /** Proposed new start of the clip (never below 0). */
  startMs: number;
  phase: TimelineGesturePhase;
}

export interface TimelineTrackDragEvent {
  trackIndex: number;
  /** Cumulative shift since 'begin', clamped so no clip goes below 0. */
  deltaMs: number;
  phase: TimelineGesturePhase;
}

export interface TimelineZoomEvent {
  pixelsPerSecond: number;
  /** Time under the pinch centre (or the requested anchor for setZoom). */
  anchorMs: number;
  phase: TimelineGesturePhase;
}

export interface TimelineScrollEvent {
  /** Time at the left edge of the lane area (right after leftInset). */
  offsetMs: number;
  /** Time span visible in the lane area. */
  visibleMs: number;
}

export interface TimelinePlayheadScrubEvent {
  ms: number;
  phase: TimelineGesturePhase;
}

type NativeEvent<T> = { nativeEvent: T };

export interface AttoTimelineViewProps {
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  /** Zoom. Source of truth whenever it changes; pinches are reported by onZoom. */
  pixelsPerSecond: number;
  playheadMs: number;
  /** The orange line placed by a tap, or null. */
  selectionLineMs?: number | null;
  /** The range with edge handles, or null. */
  selection?: TimelineSelection | null;
  /** Ruler labels: 'timecode' (00:05) or 'second' (5). Default timecode. */
  rulerFormat?: 'timecode' | 'second';
  /** Default 30. */
  rulerHeight?: number;
  /** Space reserved on the left for the JS track panels. Default 110. */
  leftInset?: number;
  /** Default 0. */
  trackGap?: number;
  /** Total content length; the scrollable width is this plus one screen. */
  durationMs: number;
  colors?: TimelineColors;
  /** Auto scroll while playing so the playhead stays visible. */
  followPlayhead?: boolean;
  style?: StyleProp<ViewStyle>;

  onTap?: (event: NativeEvent<TimelineTapEvent>) => void;
  onDoubleTap?: (event: NativeEvent<TimelineDoubleTapEvent>) => void;
  onSelectionChange?: (event: NativeEvent<TimelineSelectionChangeEvent>) => void;
  onClipMove?: (event: NativeEvent<TimelineClipMoveEvent>) => void;
  onTrackDrag?: (event: NativeEvent<TimelineTrackDragEvent>) => void;
  onZoom?: (event: NativeEvent<TimelineZoomEvent>) => void;
  onScroll?: (event: NativeEvent<TimelineScrollEvent>) => void;
  onPlayheadScrub?: (event: NativeEvent<TimelinePlayheadScrubEvent>) => void;
}

/** Imperative API exposed through the component ref. */
export interface TimelineViewRef {
  /** Scrolls so `ms` sits at the left edge of the lane area. */
  scrollToMs(ms: number, animated?: boolean): Promise<void>;
  /**
   * Applies a zoom keeping `anchorMs` in place on screen (the visible centre
   * when omitted). Emits onZoom with phase 'end' so JS can persist it.
   */
  setZoom(pixelsPerSecond: number, anchorMs?: number | null): Promise<void>;
}

// Native view functions are attached to the component prototype by
// requireNativeViewManager, so the inner ref carries them at runtime.
type NativeViewInstance = Component<AttoTimelineViewProps> & {
  scrollToMs?: (ms: number, animated: boolean) => Promise<void>;
  setZoom?: (pixelsPerSecond: number, anchorMs: number | null) => Promise<void>;
};

const nativeModule = requireOptionalNativeModule('AttoTimeline');

/** True when this binary carries the native timeline (iOS only). */
export function isTimelineViewAvailable(): boolean {
  return Platform.OS === 'ios' && nativeModule != null;
}

type NativeComponentProps = AttoTimelineViewProps & { ref?: Ref<NativeViewInstance> };

let NativeView: ComponentType<NativeComponentProps> | null = null;

function getNativeView(): ComponentType<NativeComponentProps> | null {
  if (!isTimelineViewAvailable()) return null;
  if (NativeView == null) {
    NativeView = requireNativeViewManager<NativeComponentProps>(
      'AttoTimeline',
      'AttoTimelineView'
    );
  }
  return NativeView;
}

/**
 * The native timeline. Renders nothing when the native module is missing
 * (Android, or a build that predates it); check isTimelineViewAvailable()
 * to fall back to the JS timeline.
 */
export const AttoTimelineView = forwardRef<TimelineViewRef, AttoTimelineViewProps>(
  function AttoTimelineView(props, ref) {
    const nativeRef = useRef<NativeViewInstance>(null);

    useImperativeHandle(
      ref,
      () => ({
        async scrollToMs(ms, animated = true) {
          const fn = nativeRef.current?.scrollToMs;
          if (typeof fn === 'function') {
            await fn.call(nativeRef.current, ms, animated);
          }
        },
        async setZoom(pixelsPerSecond, anchorMs = null) {
          const fn = nativeRef.current?.setZoom;
          if (typeof fn === 'function') {
            await fn.call(nativeRef.current, pixelsPerSecond, anchorMs ?? null);
          }
        },
      }),
      []
    );

    const Native = getNativeView();
    if (Native == null) return null;
    return createElement(Native, { ...props, ref: nativeRef });
  }
);
