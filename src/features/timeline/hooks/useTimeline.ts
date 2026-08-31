import { useReducer, useCallback, useEffect, useRef } from 'react';
import type {
  LocalClip,
  LaneMeta,
  TimelineState,
  TimelineAction,
  TimeRange,
  ClipEffectsPatch,
} from '../types';
import {
  splitClipAtPosition,
  deleteClip,
  endOfLaneMs,
  normalizeOrders,
  findClipAtPositionOnLane,
  clampClipPosition,
  findNearestFreeSlot,
  generateId,
  punchOutRange,
  sliceRange,
  // Aliased: the hook exposes callbacks under the plain names.
  joinClips as joinClipsOp,
  canJoinClips as canJoinClipsOp,
  insertTime as insertTimeOp,
} from '../utils/clipOperations';
import { clampDb } from '../utils/dbConversion';

/**
 * Snapshot captured by the undo/redo stack. Deliberately EXCLUDES
 * `selection` and `clipboard` — undoing a cut must not un-copy it, and
 * a region selection is not an edit.
 */
interface HistorySnapshot {
  clips: LocalClip[];
  laneMeta: Record<number, LaneMeta>;
}

const LANE_COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];

/** Exported (with `timelineReducer`) for pure-logic tests. */
export const initialTimelineState: TimelineState = {
  clips: [],
  selectedClipId: null,
  playbackPositionMs: 0,
  isPlaying: false,
  zoomLevel: 1,
  isDirty: false,
  activeLaneIndex: 0,
  laneCount: 1,
  laneMeta: {},
  selection: null,
  clipboard: null,
};

/**
 * Region ops can remove the clip the user had selected (dropped by a
 * punch-out, or the right half of a join). Drop a dangling selection.
 */
function keepSelectedIfPresent(
  selectedClipId: string | null,
  clips: LocalClip[]
): string | null {
  if (!selectedClipId) return null;
  return clips.some((c) => c.id === selectedClipId) ? selectedClipId : null;
}

/**
 * Pure reducer. Every case that changes `clips` also clears the region
 * `selection` (the range it described may no longer exist).
 */
// The ONE definition of the zoom range. The reducer clamps to it, and the
// toolbar's detents/slider and the editor's pinch preview must use the same
// symbols, or a control can ask for a level the timeline will not show.
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 4;
export function clampZoom(level: number): number {
  // Callable from the pinch gesture's UI-thread worklet. A plain function
  // reference is NOT callable on the UI runtime; calling it is the same fatal
  // jsi JSError that killed build 169 mid-call (Sentry REACT-NATIVE-4W).
  'worklet';
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, level));
}

export function timelineReducer(
  state: TimelineState,
  action: TimelineAction
): TimelineState {
  switch (action.type) {
    case 'SET_CLIPS':
      return {
        ...state,
        clips: action.clips,
        selection: null,
        selectedClipId: keepSelectedIfPresent(state.selectedClipId, action.clips),
        isDirty: true,
      };

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
      return { ...state, clips: next, selection: null, isDirty: true };
    }

    case 'SELECT_CLIP': {
      // Clip selection and region selection are mutually exclusive:
      // picking a clip (or tapping empty space) drops the region.
      if (!action.clipId) return { ...state, selectedClipId: null, selection: null };
      const selectedClip = state.clips.find((c) => c.id === action.clipId);
      return {
        ...state,
        selectedClipId: action.clipId,
        selection: null,
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
        selection: null,
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
        selection: null,
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
      return { ...state, clips: newClips, selection: null, isDirty: true };
    }

    case 'SET_PLAYBACK_POSITION':
      return { ...state, playbackPositionMs: action.positionMs };

    case 'SET_PLAYING':
      return { ...state, isPlaying: action.playing };

    case 'SET_ZOOM':
      return { ...state, zoomLevel: clampZoom(action.level) };

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
        selection: null,
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
        selection: null,
        isDirty: true,
      };
    }

    case 'MOVE_CLIP_TO_POSITION': {
      // Free positioning: drag a clip to any absolute position on its
      // lane. Clamps to >=0 AND to the wall rule so it can't overlap
      // its neighbors on the same lane.
      const clamped = clampClipPosition(state.clips, action.clipId, action.positionMs);
      const updatedClips = state.clips.map((c) =>
        c.id === action.clipId ? { ...c, positionInTimeline: clamped } : c
      );
      const next = normalizeOrders(updatedClips);
      return {
        ...state,
        clips: next,
        selection: null,
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
        selection: null,
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
      return { ...state, clips: newClips, selection: null, isDirty: true };
    }

    case 'PATCH_CLIP_EFFECTS': {
      // Effects flow: point the clip at a new render, or back at the dry
      // original. Replaces exactly segmentId / sourceSegmentId / effects;
      // in/out, position, order, volume and lane stay as they are, so
      // the take stays where the user placed it.
      if (!state.clips.some((c) => c.id === action.clipId)) return state;
      const newClips = state.clips.map((c) =>
        c.id === action.clipId
          ? {
              ...c,
              segmentId: action.patch.segmentId,
              sourceSegmentId: action.patch.sourceSegmentId,
              effects: action.patch.effects,
            }
          : c
      );
      return { ...state, clips: newClips, selection: null, isDirty: true };
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

    // ── Region editing ──
    // Non-destructive by construction: the helpers only rewrite the
    // (source, in, out, laneStart) tuples, and every paste punches out
    // its destination window BEFORE inserting, so clips can never
    // overlap on a lane (the existing wall invariant).

    case 'SET_SELECTION': {
      // Region selection lives outside the undo stack. Selecting a
      // range on a lane makes that lane active, mirroring SELECT_CLIP.
      if (!action.range) return { ...state, selection: null };
      return {
        ...state,
        selection: action.range,
        activeLaneIndex: action.range.laneIndex,
      };
    }

    case 'COPY_REGION': {
      // Read-only: nothing destructible changes, so no undo entry and
      // the selection stays (copy, then paste somewhere else). An empty
      // window is still copied — pasting it overwrites with silence,
      // the same as any DAW.
      const range = state.selection;
      if (!range || range.endMs <= range.startMs) return state;
      return { ...state, clipboard: sliceRange(state.clips, range) };
    }

    case 'CUT_REGION': {
      // Copy the window to the clipboard, then punch it out. The
      // default leaves a gap (silence). `ripple` additionally pulls the
      // rest of THAT lane left to close the gap — other lanes never
      // move, so stacked material on them stays where it was.
      const range = state.selection;
      if (!range || range.endMs <= range.startMs) return state;
      const { laneIndex, startMs, endMs } = range;
      const clipboard = sliceRange(state.clips, range);
      let clips = punchOutRange(state.clips, laneIndex, startMs, endMs);
      if (action.ripple) {
        const width = endMs - startMs;
        clips = normalizeOrders(
          clips.map((c) =>
            c.laneIndex === laneIndex && c.positionInTimeline >= endMs
              ? { ...c, positionInTimeline: c.positionInTimeline - width }
              : c
          )
        );
      }
      return {
        ...state,
        clips,
        clipboard,
        selection: null,
        selectedClipId: keepSelectedIfPresent(state.selectedClipId, clips),
        isDirty: true,
      };
    }

    case 'SILENCE_REGION': {
      // Punch out the window and leave the gap; the clipboard is not
      // touched.
      const range = state.selection;
      if (!range || range.endMs <= range.startMs) return state;
      const clips = punchOutRange(
        state.clips,
        range.laneIndex,
        range.startMs,
        range.endMs
      );
      return {
        ...state,
        clips,
        selection: null,
        selectedClipId: keepSelectedIfPresent(state.selectedClipId, clips),
        isDirty: true,
      };
    }

    case 'PASTE_REGION': {
      // OVERWRITE paste: clear the destination window first, then drop
      // the fragments in. The fragments were non-overlapping on their
      // source lane and all land inside the freed window, so no overlap
      // is possible. No-op without a clipboard.
      const { clipboard } = state;
      if (!clipboard || clipboard.durationMs <= 0) return state;
      const atMs = Math.max(0, action.atMs);
      const laneIndex = action.laneIndex;
      const cleared = punchOutRange(
        state.clips,
        laneIndex,
        atMs,
        atMs + clipboard.durationMs
      );
      const pasted: LocalClip[] = clipboard.fragments.map((f) => ({
        id: generateId(),
        segmentId: f.segmentId,
        sourceSegmentId: f.sourceSegmentId,
        effects: f.effects,
        startInSegment: f.startInSegment,
        endInSegment: f.endInSegment,
        positionInTimeline: atMs + f.offsetMs,
        order: 0,
        volume: f.volume,
        laneIndex,
      }));
      const clips = normalizeOrders([...cleared, ...pasted]);
      return {
        ...state,
        clips,
        selection: null,
        selectedClipId: keepSelectedIfPresent(state.selectedClipId, clips),
        isDirty: true,
      };
    }

    case 'JOIN_CLIPS': {
      // Heal a seam — the inverse of a split. No-op unless the pair is
      // joinable (same lane + segment, source-contiguous, touching).
      if (!canJoinClipsOp(state.clips, action.clipIdA, action.clipIdB)) return state;
      const clips = joinClipsOp(state.clips, action.clipIdA, action.clipIdB);
      // The survivor is whichever of the pair still exists. If the user
      // had either half selected, keep the healed clip selected.
      const survivorId =
        [action.clipIdA, action.clipIdB].find((id) => clips.some((c) => c.id === id)) ??
        null;
      const hadPairSelected =
        state.selectedClipId === action.clipIdA ||
        state.selectedClipId === action.clipIdB;
      return {
        ...state,
        clips,
        selection: null,
        selectedClipId: hadPairSelected
          ? survivorId
          : keepSelectedIfPresent(state.selectedClipId, clips),
        isDirty: true,
      };
    }

    case 'INSERT_TIME': {
      // Open a gap of `durationMs` at `atMs`. All lanes by default so
      // stacked material stays aligned; `allLanes: false` limits it to
      // `laneIndex`, falling back to the active lane.
      if (action.durationMs <= 0) return state;
      const lane =
        action.allLanes === false ? (action.laneIndex ?? state.activeLaneIndex) : 'all';
      const clips = insertTimeOp(
        state.clips,
        Math.max(0, action.atMs),
        action.durationMs,
        lane
      );
      return { ...state, clips, selection: null, isDirty: true };
    }

    case 'RESTORE_SNAPSHOT': {
      // Restores clips + laneMeta only. `selection` and `clipboard` are
      // deliberately left alone — they are not part of the snapshot. The clip
      // selection IS reconciled: undoing a split/duplicate removes the clip that
      // was auto-selected, and a dangling id left the toolbar stuck in edit mode
      // with a blank caption and Delete acting on nothing.
      return {
        ...state,
        clips: action.clips,
        laneMeta: action.laneMeta,
        selectedClipId: keepSelectedIfPresent(state.selectedClipId, action.clips),
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

  const [state, dispatch] = useReducer(timelineReducer, {
    ...initialTimelineState,
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
  // Latest clips for callbacks that must not close over a stale list.
  const clipsRef = useRef(state.clips);
  clipsRef.current = state.clips;
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

  /**
   * Effects flow: swap the clip onto a render (or back onto the dry
   * source). Replaces only segmentId / sourceSegmentId / effects, never
   * the geometry. One undo entry, so Undo restores the dry segment.
   */
  const patchClipEffects = useCallback(
    (clipId: string, patch: ClipEffectsPatch) => {
      // The clip can vanish during the multi-second render/upload (an in-call
      // refetch regenerates ids); without this the hook pushed a phantom undo
      // entry for a no-op dispatch.
      if (!clipsRef.current.some((c) => c.id === clipId)) return;
      pushUndo();
      dispatch({ type: 'PATCH_CLIP_EFFECTS', clipId, patch });
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

  // Gain / pan faders fire on EVERY gesture frame. Snapshotting per frame
  // pushed ~60 full-timeline copies per second of dragging onto the uncapped
  // undo stack and made Undo walk the drag back one frame at a time. Callers
  // pass `commit: true` once at gesture begin (and on a tap/double-tap reset)
  // and `commit: false` for the frames in between, so one drag = one Undo.
  const setLaneGain = useCallback(
    (laneIndex: number, gainDb: number, options?: { commit?: boolean }) => {
      if (options?.commit !== false) pushUndo();
      dispatch({ type: 'SET_LANE_GAIN', laneIndex, gainDb });
    },
    [pushUndo]
  );

  const setLanePan = useCallback(
    (laneIndex: number, pan: number, options?: { commit?: boolean }) => {
      if (options?.commit !== false) pushUndo();
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

  // ── Region editing ──
  // Selection and clipboard are NOT undoable state (see HistorySnapshot),
  // so only the ops that touch clips push a snapshot — exactly once each,
  // so a single Undo reverts the whole cut / paste / join / insert.

  /** Set (or clear with null) the region selection. Not undoable. */
  const setSelection = useCallback((range: TimeRange | null) => {
    dispatch({ type: 'SET_SELECTION', range });
  }, []);

  /** Copy the selected region to the clipboard. Read-only, so no undo. */
  const copyRegion = useCallback(() => {
    dispatch({ type: 'COPY_REGION' });
  }, []);

  /**
   * Cut the selected region: copy it to the clipboard, then punch it
   * out. Leaves a gap by default; `ripple` closes the gap on that lane
   * only.
   */
  // Same predicate the reducer uses, so a zero-width range (the drag gesture
  // starts with startMs === endMs) can never push a phantom undo entry for an
  // op the reducer then no-ops.
  const hasEditableRegion =
    state.selection !== null && state.selection.endMs > state.selection.startMs;

  const cutRegion = useCallback(
    (ripple = false) => {
      if (!hasEditableRegion) return;
      pushUndo();
      dispatch({ type: 'CUT_REGION', ripple });
    },
    [hasEditableRegion, pushUndo]
  );

  /** Replace the selected region with silence (clipboard untouched). */
  const silenceRegion = useCallback(() => {
    if (!hasEditableRegion) return;
    pushUndo();
    dispatch({ type: 'SILENCE_REGION' });
  }, [hasEditableRegion, pushUndo]);

  /**
   * Overwrite-paste the clipboard at `atMs` on `laneIndex`. Defaults to
   * the playhead and the active lane. No-op when the clipboard is empty.
   */
  const pasteRegion = useCallback(
    (atMs: number = positionMsRef.current, laneIndex: number = state.activeLaneIndex) => {
      if (!state.clipboard) return;
      pushUndo();
      dispatch({ type: 'PASTE_REGION', atMs, laneIndex });
    },
    [state.clipboard, state.activeLaneIndex, pushUndo]
  );

  /** Whether Join would heal these two clips — for enabling the UI action. */
  const canJoinClips = useCallback(
    (clipIdA: string, clipIdB: string) => canJoinClipsOp(state.clips, clipIdA, clipIdB),
    [state.clips]
  );

  /** Heal two touching, source-contiguous clips into one. No-op if not joinable. */
  const joinClips = useCallback(
    (clipIdA: string, clipIdB: string) => {
      if (!canJoinClipsOp(state.clips, clipIdA, clipIdB)) return;
      pushUndo();
      dispatch({ type: 'JOIN_CLIPS', clipIdA, clipIdB });
    },
    [state.clips, pushUndo]
  );

  /**
   * Insert `durationMs` of empty time at `atMs`. All lanes by default;
   * `{ allLanes: false }` limits it to `laneIndex` (default: active lane).
   */
  const insertTime = useCallback(
    (
      atMs: number,
      durationMs: number,
      options?: { allLanes?: boolean; laneIndex?: number }
    ) => {
      if (durationMs <= 0) return;
      pushUndo();
      dispatch({
        type: 'INSERT_TIME',
        atMs,
        durationMs,
        allLanes: options?.allLanes,
        laneIndex: options?.laneIndex,
      });
    },
    [pushUndo]
  );

  return {
    state,
    setClips,
    addClip,
    selectClip,
    splitAtPlayhead,
    deleteSelectedClip,
    trimClip,
    setVolume,
    patchClipEffects,
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
    setSelection,
    copyRegion,
    cutRegion,
    silenceRegion,
    pasteRegion,
    canJoinClips,
    joinClips,
    insertTime,
    undo,
    redo,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
  };
}
