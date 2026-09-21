import type { EffectChain } from '../../modules/atto-audio-transcode';
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

/** Mix bus effects; the export applies the same values the editor previews. */
export interface MasterEffects {
  /** Semitone shift of the whole mix, minus 12 to 12. */
  pitchSemitones?: number;
  /** Playback rate of the whole mix, 0.5 to 2. */
  tempoRate?: number;
  reverb?: { preset?: string; wetDryMix?: number };
  /** Ten gains in dB at 32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000 Hz. */
  eqGainsDb?: number[];
}

export type ExportFormat = 'wav' | 'mp3' | 'aac' | 'alac' | 'flac';
export type ExportQuality = 'low' | 'medium' | 'high';

export interface ExportOptions {
  format?: ExportFormat;
  quality?: ExportQuality;
  sampleRate?: 8000 | 22050 | 44100 | 48000;
  channels?: 1 | 2;
  title?: string;
  author?: string;
  isrc?: string;
  fileName?: string;
  /** Storage key returned by the cover upload. */
  coverKey?: string;
}

export interface ProjectSettings {
  master?: MasterEffects;
  exportPrefs?: ExportOptions;
  automation?: Record<string, Array<[number, number]>>;
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
  /** Editor settings: master effects, exporter preferences, automation. */
  settings?: ProjectSettings;
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
  /**
   * Rendered-segment effects model: when an effect chain is applied, the client
   * renders it on-device, uploads the result as a NEW segment and points
   * `segmentId` at it. The DRY original stays here so the effect can be removed
   * or re-tweaked; `effects` is the chain that produced the render. Both null =
   * plain dry clip. Export mixes `segmentId` as-is, so preview == export.
   */
  sourceSegmentId?: string | null;
  effects?: EffectChain | null;
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
  sourceSegmentId?: string | null;
  effects?: EffectChain | null;
}

export interface ExportResult {
  downloadUrl: string;
  fileSizeBytes: number;
}
