import type { AudioSegment } from './call';

export interface LaneMetadata {
  name: string;
  color: string;
  /** Whether the lane is muted. */
  muted?: boolean;
  /** Whether the lane is soloed. */
  solo?: boolean;
  /** Lane gain in dB (-60..+12). */
  gainDb?: number;
  /** Stereo pan (-1..1). */
  pan?: number;
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  status: 'active' | 'archived' | 'exported';
  segmentCount?: number;
  totalDurationMs?: number;
  lanes: Record<string, LaneMetadata>;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDetail {
  project: Project;
  segments: (AudioSegment & { downloadUrl: string })[];
  clips: TimelineClip[];
}

export interface TimelineClip {
  id: string;
  projectId: string;
  segmentId: string;
  startInSegment: number;
  endInSegment: number;
  positionInTimeline: number;
  order: number;
  volume: number;
  laneIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface TimelineClipInput {
  segmentId: string;
  startInSegment: number;
  endInSegment: number;
  positionInTimeline: number;
  order: number;
  volume?: number;
  laneIndex?: number;
}

export interface ExportResult {
  downloadUrl: string;
  fileSizeBytes: number;
}
