import type { TimelineClip, TimelineClipInput } from '@/types/project';
import type { AudioSegment } from '@/types/call';

export interface LocalClip {
  id: string;
  segmentId: string;
  startInSegment: number;
  endInSegment: number;
  positionInTimeline: number;
  order: number;
  volume: number;
  laneIndex: number;
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
  | { type: 'SET_VOLUME'; clipId: string; volume: number };

export function clipToInput(clip: LocalClip): TimelineClipInput {
  return {
    segmentId: clip.segmentId,
    startInSegment: Math.round(clip.startInSegment),
    endInSegment: Math.round(clip.endInSegment),
    positionInTimeline: Math.round(clip.positionInTimeline),
    order: Math.round(clip.order),
    volume: clip.volume,
    laneIndex: clip.laneIndex,
  };
}

export function serverClipToLocal(clip: TimelineClip): LocalClip {
  return {
    id: clip.id,
    segmentId: clip.segmentId,
    startInSegment: clip.startInSegment,
    endInSegment: clip.endInSegment,
    positionInTimeline: clip.positionInTimeline,
    order: clip.order,
    volume: clip.volume,
    laneIndex: clip.laneIndex ?? 0,
  };
}
