import { useReducer, useCallback, useRef } from 'react';
import type { LocalClip, LaneMeta, TimelineState, TimelineAction } from '../types';
import {
  splitClipAtPosition,
  deleteClip,
  recalculatePositions,
  findClipAtPositionOnLane,
} from '../utils/clipOperations';

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
      const clipWithLane = {
        ...action.clip,
        laneIndex: action.clip.laneIndex ?? state.activeLaneIndex,
      };
      const combined = [...state.clips, clipWithLane];
      return { ...state, clips: recalculatePositions(combined), isDirty: true };
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
      const newClips = state.clips.map((c) =>
        c.id === action.clipId
          ? {
              ...c,
              startInSegment: action.startInSegment,
              endInSegment: action.endInSegment,
            }
          : c
      );
      return {
        ...state,
        clips: recalculatePositions(newClips),
        isDirty: true,
      };
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
        clips: recalculatePositions(updatedClips),
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
      const clip = state.clips.find((c) => c.id === action.clipId);
      if (!clip || clip.laneIndex === action.toLane) return state;
      const targetLaneClips = state.clips.filter((c) => c.laneIndex === action.toLane);
      const maxOrder =
        targetLaneClips.length > 0
          ? Math.max(...targetLaneClips.map((c) => c.order))
          : -1;
      const updatedClips = state.clips.map((c) =>
        c.id === action.clipId
          ? { ...c, laneIndex: action.toLane, order: maxOrder + 1 }
          : c
      );
      return {
        ...state,
        clips: recalculatePositions(updatedClips),
        isDirty: true,
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

  // Undo/redo stacks
  const undoStack = useRef<LocalClip[][]>([]);
  const redoStack = useRef<LocalClip[][]>([]);

  // Ref for always-current playback position (avoids stale closure in splitAtPlayhead)
  const positionMsRef = useRef(state.playbackPositionMs);
  positionMsRef.current = state.playbackPositionMs;

  const pushUndo = useCallback(() => {
    undoStack.current.push(state.clips.map((c) => ({ ...c })));
    redoStack.current = [];
  }, [state.clips]);

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

  const setLaneMeta = useCallback((laneIndex: number, meta: LaneMeta) => {
    dispatch({ type: 'SET_LANE_META', laneIndex, meta });
  }, []);

  const moveClip = useCallback(
    (clipId: string, toLane: number) => {
      pushUndo();
      dispatch({ type: 'MOVE_CLIP', clipId, toLane });
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

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(state.clips.map((c) => ({ ...c })));
    dispatch({ type: 'SET_CLIPS', clips: prev });
  }, [state.clips]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(state.clips.map((c) => ({ ...c })));
    dispatch({ type: 'SET_CLIPS', clips: next });
  }, [state.clips]);

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
    removeLane,
    setLaneMeta,
    undo,
    redo,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
  };
}
