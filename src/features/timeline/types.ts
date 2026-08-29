import type { TimelineClip, TimelineClipInput } from '@/types/project';
import type { AudioSegment } from '@/types/call';
import type { EffectChain } from '../../../modules/atto-audio-transcode';

// Re-exported so the timeline feature (and its tests) can name the chain
// without reaching into the native module's path.
export type { EffectChain };

export interface LocalClip {
  id: string;
  segmentId: string;
  startInSegment: number;
  endInSegment: number;
  positionInTimeline: number;
  order: number;
  volume: number;
  laneIndex: number;
  /**
   * Rendered-segment effects model (see `TimelineClip`): `segmentId`
   * points at the on-device render, `sourceSegmentId` keeps the DRY
   * original so the effect can be removed / re-tweaked, and `effects`
   * is the chain that produced the render. Absent or null = plain dry
   * clip. Both travel with every copy of the clip (split, duplicate,
   * punch-out survivors, clipboard fragments, pastes).
   */
  sourceSegmentId?: string | null;
  effects?: EffectChain | null;
}

/**
 * The fields the effects flow rewrites on a clip — exactly these and
 * nothing else, so a patch can never move or re-trim the take.
 */
export interface ClipEffectsPatch {
  segmentId: string;
  sourceSegmentId: string | null;
  effects: EffectChain | null;
}

export interface LaneMeta {
  name: string;
  color: string;
  /** Whether the lane is muted. Default: false. */
  muted?: boolean;
  /** Whether the lane is soloed. Default: false. */
  solo?: boolean;
  /** Lane gain in dB. Default: 0. Range: -60..+12. */
  gainDb?: number;
  /** Stereo pan. -1 = full left, 0 = center, 1 = full right. Default: 0. */
  pan?: number;
}

/**
 * A time window on ONE lane, used for region editing (copy / cut /
 * silence). `endMs` is exclusive: the window is [startMs, endMs).
 */
export interface TimeRange {
  laneIndex: number;
  startMs: number;
  endMs: number;
}

/**
 * A lane-agnostic piece of a clip captured by Copy / Cut. Only the
 * (source, in, out) tuple travels — never audio. `offsetMs` is the
 * fragment's start relative to the start of the copied window, so a
 * paste at `atMs` lands it at `atMs + offsetMs`.
 */
export interface ClipboardFragment {
  segmentId: string;
  /** Effects model, carried so a pasted copy of an effected clip stays effected. */
  sourceSegmentId: string | null;
  effects: EffectChain | null;
  startInSegment: number;
  endInSegment: number;
  offsetMs: number;
  volume: number;
}

/**
 * Contents of the region clipboard. `durationMs` is the full width of
 * the copied window (leading, internal and trailing gaps included), so
 * an overwrite-paste clears exactly that much on the target lane.
 */
export interface Clipboard {
  fragments: ClipboardFragment[];
  durationMs: number;
}

export interface TimelineState {
  clips: LocalClip[];
  selectedClipId: string | null;
  playbackPositionMs: number;
  isPlaying: boolean;
  zoomLevel: number;
  isDirty: boolean;
  activeLaneIndex: number;
  laneCount: number;
  laneMeta: Record<number, LaneMeta>;
  /** Active region selection. NOT part of the undo snapshot. */
  selection: TimeRange | null;
  /** Region clipboard (Copy / Cut). NOT part of the undo snapshot. */
  clipboard: Clipboard | null;
}

export type TimelineAction =
  | { type: 'SET_CLIPS'; clips: LocalClip[] }
  | { type: 'ADD_CLIP'; clip: LocalClip }
  | { type: 'SELECT_CLIP'; clipId: string | null }
  | { type: 'SPLIT_AT_POSITION'; positionMs: number }
  | { type: 'DELETE_CLIP'; clipId: string }
  | { type: 'TRIM_CLIP'; clipId: string; startInSegment: number; endInSegment: number }
  | { type: 'SET_PLAYBACK_POSITION'; positionMs: number }
  | { type: 'SET_PLAYING'; playing: boolean }
  | { type: 'SET_ZOOM'; level: number }
  | { type: 'MARK_CLEAN' }
  | { type: 'SET_ACTIVE_LANE'; laneIndex: number }
  | { type: 'ADD_LANE' }
  | { type: 'REMOVE_LANE'; laneIndex: number }
  | { type: 'SET_LANE_META'; laneIndex: number; meta: LaneMeta }
  | { type: 'SET_LANE_MUTE'; laneIndex: number; muted: boolean }
  | { type: 'SET_LANE_SOLO'; laneIndex: number; solo: boolean }
  | { type: 'SET_LANE_GAIN'; laneIndex: number; gainDb: number }
  | { type: 'SET_LANE_PAN'; laneIndex: number; pan: number }
  | { type: 'RESTORE_SNAPSHOT'; clips: LocalClip[]; laneMeta: Record<number, LaneMeta> }
  | { type: 'MOVE_CLIP'; clipId: string; toLane: number }
  | { type: 'MOVE_CLIP_TO_POSITION'; clipId: string; positionMs: number }
  | { type: 'DUPLICATE_CLIP'; clipId: string }
  | { type: 'SET_VOLUME'; clipId: string; volume: number }
  | { type: 'PATCH_CLIP_EFFECTS'; clipId: string; patch: ClipEffectsPatch }
  | { type: 'SET_SELECTION'; range: TimeRange | null }
  | { type: 'COPY_REGION' }
  | { type: 'CUT_REGION'; ripple?: boolean }
  | { type: 'SILENCE_REGION' }
  | { type: 'PASTE_REGION'; atMs: number; laneIndex: number }
  | { type: 'JOIN_CLIPS'; clipIdA: string; clipIdB: string }
  | {
      type: 'INSERT_TIME';
      atMs: number;
      durationMs: number;
      /** Default true. When false only `laneIndex` (or the active lane) opens up. */
      allLanes?: boolean;
      laneIndex?: number;
    };

export function clipToInput(clip: LocalClip): TimelineClipInput {
  const input: TimelineClipInput = {
    segmentId: clip.segmentId,
    startInSegment: Math.round(clip.startInSegment),
    endInSegment: Math.round(clip.endInSegment),
    positionInTimeline: Math.round(clip.positionInTimeline),
    order: Math.round(clip.order),
    volume: clip.volume,
    laneIndex: clip.laneIndex,
  };
  // The effects fields travel only when the clip carries them, so an
  // older backend never sees unknown keys. `null` is meaningful (an
  // explicit "back to dry") and is sent as-is.
  if (clip.sourceSegmentId !== undefined) input.sourceSegmentId = clip.sourceSegmentId;
  if (clip.effects !== undefined) input.effects = clip.effects;
  return input;
}

export function serverClipToLocal(clip: TimelineClip): LocalClip {
  const local: LocalClip = {
    id: clip.id,
    segmentId: clip.segmentId,
    startInSegment: clip.startInSegment,
    endInSegment: clip.endInSegment,
    positionInTimeline: clip.positionInTimeline,
    order: clip.order,
    volume: clip.volume,
    laneIndex: clip.laneIndex ?? 0,
  };
  // Mirror of `clipToInput`: keep absence as absence (a backend that
  // doesn't know the fields yields a clip that won't send them back).
  if (clip.sourceSegmentId !== undefined) local.sourceSegmentId = clip.sourceSegmentId;
  if (clip.effects !== undefined) local.effects = clip.effects;
  return local;
}
