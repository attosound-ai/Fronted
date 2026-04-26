import { useReducer, useCallback, useEffect, useRef } from 'react';
import type { LocalClip, LaneMeta, TimelineState, TimelineAction } from '../types';
import {
  splitClipAtPosition,
  deleteClip,
  endOfLaneMs,
  normalizeOrders,
  findClipAtPositionOnLane,
  clampClipPosition,
  findNearestFreeSlot,
} from '../utils/clipOperations';
import { clampDb } from '../utils/dbConversion';

/** Snapshot captured by the undo/redo stack. */
interface HistorySnapshot {
  clips: LocalClip[];
  laneMeta: Record<number, LaneMeta>;
}

const LANE_COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];

const initialState: TimelineState = {
  clips: [],
  selectedClipId: null,
  playbackPositionMs: 0,
  isPlaying: false,
  zoomLevel: 1,
  isDirty: false,
  activeLaneIndex: 0,
  laneCount: 1,
  laneMeta: {},
};

function reducer(state: TimelineState, action: TimelineAction): TimelineState {
  switch (action.type) {
    case 'SET_CLIPS':
      return { ...state, clips: action.clips, isDirty: true };

    case 'ADD_CLIP': {
      // Place the new clip at the rightmost edge of its lane so it
      // doesn't overlap with existing clips. The user can then drag it
      // to a different position via the long-press drag gesture.
      const laneIndex = action.clip.laneIndex ?? state.activeLaneIndex;
      const lanePosition = endOfLaneMs(state.clips, laneIndex);
      const clipWithLane = {
        ...action.clip,
        laneIndex,
        positionInTimeline: lanePosition,
      };
      const next = normalizeOrders([...state.clips, clipWithLane]);
      return { ...state, clips: next, isDirty: true };
    }

    case 'SELECT_CLIP': {
      if (!action.clipId) return { ...state, selectedClipId: null };
      const selectedClip = state.clips.find((c) => c.id === action.clipId);
      return {
        ...state,
        selectedClipId: action.clipId,
        activeLaneIndex: selectedClip ? selectedClip.laneIndex : state.activeLaneIndex,
      };
    }

    case 'SPLIT_AT_POSITION': {
      // Only split on the active lane
      const target = findClipAtPositionOnLane(
        state.clips,
        action.positionMs,
        state.activeLaneIndex
      );
      if (!target) return state;
      const newClips = splitClipAtPosition(state.clips, target.id, action.positionMs);
      // Auto-select the second clip (new half) for visual feedback
      const newClipB = newClips.find(
        (c) =>
          c.id !== target.id &&
          c.segmentId === target.segmentId &&
          c.laneIndex === target.laneIndex
      );
      return {
        ...state,
        clips: newClips,
        isDirty: true,
        selectedClipId: newClipB?.id ?? null,
      };
    }

    case 'DELETE_CLIP': {
      const newClips = deleteClip(state.clips, action.clipId);
      return {
        ...state,
        clips: newClips,
        selectedClipId:
          state.selectedClipId === action.clipId ? null : state.selectedClipId,
        isDirty: true,
      };
    }

    case 'TRIM_CLIP': {
      // Trimming the in/out points of a clip does NOT shift other
      // clips' positions. The trimmed clip stays anchored where it
      // was on the timeline.
      const newClips = state.clips.map((c) =>
        c.id === action.clipId
          ? {
              ...c,
              startInSegment: action.startInSegment,
              endInSegment: action.endInSegment,
            }
          : c
      );
      return { ...state, clips: newClips, isDirty: true };
    }

    case 'SET_PLAYBACK_POSITION':
      return { ...state, playbackPositionMs: action.positionMs };

    case 'SET_PLAYING':
      return { ...state, isPlaying: action.playing };

    case 'SET_ZOOM':
      return { ...state, zoomLevel: Math.max(0.1, Math.min(4, action.level)) };

    case 'MARK_CLEAN':
      return { ...state, isDirty: false };

    case 'SET_ACTIVE_LANE':
      return { ...state, activeLaneIndex: action.laneIndex };

    case 'ADD_LANE': {
      const newIndex = state.laneCount;
      const color = LANE_COLORS[newIndex % LANE_COLORS.length];
      return {
        ...state,
        laneCount: state.laneCount + 1,
        laneMeta: {
          ...state.laneMeta,
          [newIndex]: { name: '', color },
        },
      };
    }

    case 'REMOVE_LANE': {
      if (state.laneCount <= 1) return state;
      const laneToRemove = action.laneIndex;
      const updatedClips = state.clips
        .filter((c) => c.laneIndex !== laneToRemove)
        .map((c) =>
          c.laneIndex > laneToRemove ? { ...c, laneIndex: c.laneIndex - 1 } : c
        );
      // Shift lane meta keys down
      const newMeta: Record<number, LaneMeta> = {};
      for (const [key, val] of Object.entries(state.laneMeta)) {
        const k = Number(key);
        if (k < laneToRemove) newMeta[k] = val;
        else if (k > laneToRemove) newMeta[k - 1] = val;
      }
      const newActiveLane =
        state.activeLaneIndex >= state.laneCount - 1
          ? state.laneCount - 2
          : state.activeLaneIndex;
      return {
        ...state,
        clips: updatedClips,
        laneCount: state.laneCount - 1,
        activeLaneIndex: newActiveLane,
        laneMeta: newMeta,
        isDirty: true,
      };
    }

    case 'SET_LANE_META':
      return {
        ...state,
        laneMeta: { ...state.laneMeta, [action.laneIndex]: action.meta },
        isDirty: true,
      };

    case 'MOVE_CLIP': {
      // Move a clip between lanes. We try to land it at the same
      // x-position it had on the source lane, snapped to the closest
      // free slot of the right size on the target lane (so it doesn't
      // overlap an existing clip there). Falls back to the end of the
      // target lane if no slot fits. If the user is dropping back on
      // the same lane, no-op.
      const clip = state.clips.find((c) => c.id === action.clipId);
      if (!clip || clip.laneIndex === action.toLane) return state;
      const duration = clip.endInSegment - clip.startInSegment;
      const newPosition = findNearestFreeSlot(
        state.clips,
        action.toLane,
        duration,
        clip.positionInTimeline
      );
      const updatedClips = state.clips.map((c) =>
        c.id === action.clipId
          ? { ...c, laneIndex: action.toLane, positionInTimeline: newPosition }
          : c
      );
      return {
        ...state,
        clips: normalizeOrders(updatedClips),
        isDirty: true,
      };
    }

    case 'MOVE_CLIP_TO_POSITION': {
      // Free positioning: drag a clip to any absolute position on its
      // lane. Clamps to >=0 AND to the wall rule so it can't overlap
      // its neighbors on the same lane.
      const clamped = clampClipPosition(
        state.clips,
        action.clipId,
        action.positionMs
      );
      const updatedClips = state.clips.map((c) =>
        c.id === action.clipId ? { ...c, positionInTimeline: clamped } : c
      );
      const next = normalizeOrders(updatedClips);
      return {
        ...state,
        clips: next,
        isDirty: true,
      };
    }

    case 'DUPLICATE_CLIP': {
      // Insert a copy of the clip immediately after the original on the
      // same lane (back-to-back, no gap). If there's no room directly
      // after, fall back to the closest gap that fits via
      // `findNearestFreeSlot`.
      const source = state.clips.find((c) => c.id === action.clipId);
      if (!source) return state;
      const duration = source.endInSegment - source.startInSegment;
      const preferredPosition = source.positionInTimeline + duration;
      const dropPosition = findNearestFreeSlot(
        state.clips,
        source.laneIndex,
        duration,
        preferredPosition
      );
      const newClip: LocalClip = {
        ...source,
        id:
          'clip_' +
          Date.now().toString(36) +
          '_' +
          Math.random().toString(36).slice(2, 9),
        positionInTimeline: dropPosition,
      };
      return {
        ...state,
        clips: normalizeOrders([...state.clips, newClip]),
        isDirty: true,
        selectedClipId: newClip.id,
      };
    }

    case 'SET_VOLUME': {
      const newClips = state.clips.map((c) =>
        c.id === action.clipId
          ? { ...c, volume: Math.max(0, Math.min(1, action.volume)) }
          : c
      );
      return { ...state, clips: newClips, isDirty: true };
    }

    case 'SET_LANE_MUTE': {
      const existing = state.laneMeta[action.laneIndex] ?? { name: '', color: '' };
      return {
        ...state,
        laneMeta: {
          ...state.laneMeta,
          [action.laneIndex]: { ...existing, muted: action.muted },
        },
        isDirty: true,
      };
    }

    case 'SET_LANE_SOLO': {
      const existing = state.laneMeta[action.laneIndex] ?? { name: '', color: '' };
      return {
        ...state,
        laneMeta: {
          ...state.laneMeta,
          [action.laneIndex]: { ...existing, solo: action.solo },
        },
        isDirty: true,
      };
    }

    case 'SET_LANE_GAIN': {
      const existing = state.laneMeta[action.laneIndex] ?? { name: '', color: '' };
      return {
        ...state,
        laneMeta: {
          ...state.laneMeta,
          [action.laneIndex]: { ...existing, gainDb: clampDb(action.gainDb) },
        },
        isDirty: true,
      };
    }

    case 'SET_LANE_PAN': {
      const existing = state.laneMeta[action.laneIndex] ?? { name: '', color: '' };
      const clamped = Math.max(-1, Math.min(1, action.pan));
      return {
        ...state,
        laneMeta: {
          ...state.laneMeta,
          [action.laneIndex]: { ...existing, pan: clamped },
        },
        isDirty: true,
      };
    }

    case 'RESTORE_SNAPSHOT': {
      return {
        ...state,
        clips: action.clips,
        laneMeta: action.laneMeta,
        isDirty: true,
      };
    }

    default:
      return state;
  }
}

export function useTimeline(
  initialClips: LocalClip[],
  initialLaneMeta?: Record<number, LaneMeta>
) {
  // Derive initial lane count from clips
  const maxLane = initialClips.reduce((max, c) => Math.max(max, c.laneIndex ?? 0), 0);
  const laneCount = Math.max(1, maxLane + 1);

  // Build default meta for lanes that don't have persisted metadata
  const defaultMeta: Record<number, LaneMeta> = {};
  for (let i = 0; i < laneCount; i++) {
    defaultMeta[i] = initialLaneMeta?.[i] ?? {
      name: '',
      color: LANE_COLORS[i % LANE_COLORS.length],
    };
  }

  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    clips: initialClips,
    laneCount,
    laneMeta: defaultMeta,
  });

  // Re-sync state when the caller passes new initial data (e.g. after a
  // background refetch resolves with fresher data). `useReducer`'s
  // initial-state argument is read once on mount, so without this effect
  // we'd silently keep stale data forever. Callers can also force a
  // remount via a `key` prop on the host component for the same effect.
  const initialClipsRef = useRef(initialClips);
  const initialLaneMetaRef = useRef(initialLaneMeta);
  useEffect(() => {
    if (
      initialClipsRef.current === initialClips &&
      initialLaneMetaRef.current === initialLaneMeta
    ) {
      return;
    }
    initialClipsRef.current = initialClips;
    initialLaneMetaRef.current = initialLaneMeta;
    dispatch({
      type: 'RESTORE_SNAPSHOT',
      clips: initialClips,
      laneMeta: defaultMeta,
    });
  }, [initialClips, initialLaneMeta, defaultMeta]);

  // Undo/redo stacks — snapshots capture BOTH clips and laneMeta so mixer
  // changes (mute/solo/gain/pan/name/color) are fully undoable.
  const undoStack = useRef<HistorySnapshot[]>([]);
  const redoStack = useRef<HistorySnapshot[]>([]);

  // Ref for always-current playback position (avoids stale closure in splitAtPlayhead)
  const positionMsRef = useRef(state.playbackPositionMs);
  positionMsRef.current = state.playbackPositionMs;

  const snapshot = useCallback(
    (): HistorySnapshot => ({
      clips: state.clips.map((c) => ({ ...c })),
      laneMeta: Object.fromEntries(
        Object.entries(state.laneMeta).map(([k, v]) => [k, { ...v }])
      ),
    }),
    [state.clips, state.laneMeta]
  );

  const pushUndo = useCallback(() => {
    undoStack.current.push(snapshot());
    redoStack.current = [];
  }, [snapshot]);

  const setClips = useCallback((clips: LocalClip[]) => {
    dispatch({ type: 'SET_CLIPS', clips });
  }, []);

  const addClip = useCallback(
    (clip: LocalClip) => {
      pushUndo();
      dispatch({ type: 'ADD_CLIP', clip });
    },
    [pushUndo]
  );

  const selectClip = useCallback((clipId: string | null) => {
    dispatch({ type: 'SELECT_CLIP', clipId });
  }, []);

  const splitAtPlayhead = useCallback(() => {
    pushUndo();
    dispatch({ type: 'SPLIT_AT_POSITION', positionMs: positionMsRef.current });
  }, [pushUndo, state.clips.length]);

  const deleteSelectedClip = useCallback(() => {
    if (!state.selectedClipId) return;
    pushUndo();
    dispatch({ type: 'DELETE_CLIP', clipId: state.selectedClipId });
  }, [state.selectedClipId, state.clips.length, pushUndo]);

  const trimClip = useCallback(
    (clipId: string, startInSegment: number, endInSegment: number) => {
      pushUndo();
      dispatch({ type: 'TRIM_CLIP', clipId, startInSegment, endInSegment });
    },
    [pushUndo]
  );

  const setPlaybackPosition = useCallback((positionMs: number) => {
    dispatch({ type: 'SET_PLAYBACK_POSITION', positionMs });
  }, []);

  const setPlaying = useCallback((playing: boolean) => {
    dispatch({ type: 'SET_PLAYING', playing });
  }, []);

  const setZoom = useCallback((level: number) => {
    dispatch({ type: 'SET_ZOOM', level });
  }, []);

  const setVolume = useCallback(
    (clipId: string, volume: number) => {
      pushUndo();
      dispatch({ type: 'SET_VOLUME', clipId, volume });
    },
    [pushUndo]
  );

  const markClean = useCallback(() => {
    dispatch({ type: 'MARK_CLEAN' });
  }, []);

  const setActiveLane = useCallback((laneIndex: number) => {
    dispatch({ type: 'SET_ACTIVE_LANE', laneIndex });
  }, []);

  const addLane = useCallback(() => {
    dispatch({ type: 'ADD_LANE' });
  }, []);

  const setLaneMeta = useCallback(
    (laneIndex: number, meta: LaneMeta) => {
      // Snapshot before mutating so Undo can restore the previous name /
      // color. This runs on explicit save (from LaneEditSheet) rather
      // than per keystroke, so the undo stack stays coarse-grained.
      pushUndo();
      dispatch({ type: 'SET_LANE_META', laneIndex, meta });
    },
    [pushUndo]
  );

  const moveClip = useCallback(
    (clipId: string, toLane: number) => {
      pushUndo();
      dispatch({ type: 'MOVE_CLIP', clipId, toLane });
    },
    [pushUndo]
  );

  /**
   * Free-positioning drag — set a clip's absolute position in
   * milliseconds. Snapshot is pushed once per drag (at start), so undo
   * restores the pre-drag position cleanly.
   */
  const moveClipToPosition = useCallback(
    (clipId: string, positionMs: number) => {
      pushUndo();
      dispatch({ type: 'MOVE_CLIP_TO_POSITION', clipId, positionMs });
    },
    [pushUndo]
  );

  /**
   * Duplicate a clip — inserts a copy back-to-back to the right of
   * the original on the same lane. Falls back to the closest free
   * slot if there's no room directly after.
   */
  const duplicateClip = useCallback(
    (clipId: string) => {
      pushUndo();
      dispatch({ type: 'DUPLICATE_CLIP', clipId });
    },
    [pushUndo]
  );

  const removeLane = useCallback(
    (laneIndex: number) => {
      const hasClips = state.clips.some((c) => c.laneIndex === laneIndex);
      if (hasClips) return;
      pushUndo();
      dispatch({ type: 'REMOVE_LANE', laneIndex });
    },
    [state.clips, pushUndo]
  );

  // ── Per-lane mixer controls ──
  const setLaneMute = useCallback(
    (laneIndex: number, muted: boolean) => {
      pushUndo();
      dispatch({ type: 'SET_LANE_MUTE', laneIndex, muted });
    },
    [pushUndo]
  );

  const setLaneSolo = useCallback(
    (laneIndex: number, solo: boolean) => {
      pushUndo();
      dispatch({ type: 'SET_LANE_SOLO', laneIndex, solo });
    },
    [pushUndo]
  );

  const setLaneGain = useCallback(
    (laneIndex: number, gainDb: number) => {
      pushUndo();
      dispatch({ type: 'SET_LANE_GAIN', laneIndex, gainDb });
    },
    [pushUndo]
  );

  const setLanePan = useCallback(
    (laneIndex: number, pan: number) => {
      pushUndo();
      dispatch({ type: 'SET_LANE_PAN', laneIndex, pan });
    },
    [pushUndo]
  );

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(snapshot());
    dispatch({ type: 'RESTORE_SNAPSHOT', clips: prev.clips, laneMeta: prev.laneMeta });
  }, [snapshot]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(snapshot());
    dispatch({ type: 'RESTORE_SNAPSHOT', clips: next.clips, laneMeta: next.laneMeta });
  }, [snapshot]);

  return {
    state,
    setClips,
    addClip,
    selectClip,
    splitAtPlayhead,
    deleteSelectedClip,
    trimClip,
    setVolume,
    setPlaybackPosition,
    setPlaying,
    setZoom,
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
    undo,
    redo,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
  };
}
