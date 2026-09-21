import { useCallback, useEffect, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

import { showToast } from '@/components/ui/Toast';
import { showNetFailureToast } from '@/components/ui/netToast';
import { projectService } from '@/lib/api/projectService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { withTimeout } from '@/lib/net/connectivity';
import i18n from '@/lib/i18n';
import {
  addProcessProgressListener,
  isRangeProcessAvailable,
  isTranscodeAvailable,
  previewRange,
  processRange,
  toTelephonyWav,
  type RangeOp,
} from '../../../../modules/atto-audio-transcode';
import type { AudioSegment } from '@/types/call';
import type { LocalClip, TimeRange } from '../types';
import { studioPrefs } from '../studio/studioPrefs';

interface Options {
  projectId: string;
  segments: (AudioSegment & { downloadUrl: string })[];
  addSegment: (segment: AudioSegment & { downloadUrl: string }) => void;
  replaceClipSource: (args: {
    clipId: string;
    segmentId: string;
    sourceSegmentId: string;
    startInSegment: number;
    endInSegment: number;
    ripple?: boolean;
  }) => void;
}

const tx = (key: string, def: string): string =>
  i18n.t(`projects:${key}`, { defaultValue: def });

const SOURCE_DOWNLOAD_TIMEOUT_MS = 60_000;
/**
 * A native render that never settles would leave the hook busy for good and
 * every later apply would do nothing. Bound it: 3 minutes is far more than a
 * take needs, and a timeout surfaces instead of hanging.
 */
const RENDER_TIMEOUT_MS = 180_000;

/** Every step of the flow reports, so a failure names its own phase. */
function track(phase: string, props: Record<string, unknown>): void {
  analytics.capture(ANALYTICS_EVENTS.PROJECT.RANGE_EFFECT, { phase, ...props });
}

/** Fetch the clip's playable source to the cache, trusting only a plausible file. */
async function ensureLocalSource(
  segment: AudioSegment & { downloadUrl: string }
): Promise<string> {
  const url = segment.downloadUrl;
  if (!url) throw new Error(`Segment ${segment.id} has no download URL`);
  if (url.startsWith('file://') || url.startsWith('/')) return url;
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
  const safeExt = ext && ext.length <= 4 ? ext : 'wav';
  const path = `${FileSystem.cacheDirectory}rx-src-${segment.id}.${safeExt}`;
  const info = await FileSystem.getInfoAsync(path);
  if (
    info.exists &&
    'size' in info &&
    typeof info.size === 'number' &&
    info.size > 1024
  ) {
    return path;
  }
  await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
  const dl = await withTimeout(
    FileSystem.downloadAsync(url, path),
    SOURCE_DOWNLOAD_TIMEOUT_MS
  );
  if (dl.status < 200 || dl.status >= 300) {
    await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
    throw new Error(`Source download failed (${dl.status})`);
  }
  return path;
}

/** The clips a lane range touches, with the file window each one covers. */
function clipsInRange(clips: LocalClip[], range: TimeRange) {
  const out: { clip: LocalClip; fileStartMs: number; fileEndMs: number }[] = [];
  for (const clip of clips) {
    if (clip.laneIndex !== range.laneIndex) continue;
    const clipStart = clip.positionInTimeline;
    const clipEnd = clipStart + (clip.endInSegment - clip.startInSegment);
    const from = Math.max(range.startMs, clipStart);
    const to = Math.min(range.endMs, clipEnd);
    if (to - from < 1) continue;
    out.push({
      clip,
      fileStartMs: clip.startInSegment + (from - clipStart),
      fileEndMs: clip.startInSegment + (to - clipStart),
    });
  }
  return out;
}

/**
 * Range effects, the SoundLab way but on our clip model: every clip the
 * range touches gets its source rendered natively with the op applied to
 * the covered window only, the render is stored as a new segment, and the
 * clip points at it (the dry original stays reachable through
 * sourceSegmentId, and the reducer entry is undoable). Length changing
 * ops resize the clip's window and ripple the lane.
 */
export function useRangeEffects({
  projectId,
  segments,
  addSegment,
  replaceClipSource,
}: Options) {
  const [busy, setBusy] = useState(false);
  /** Last failure, shown inside the effect dialog (a toast hides behind it). */
  const [lastError, setLastError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const busyRef = useRef(false);
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  const previewPlayerRef = useRef<AudioPlayer | null>(null);

  const available = isRangeProcessAvailable();

  useEffect(() => {
    const sub = addProcessProgressListener((e) => {
      if (busyRef.current) setProgress(e.progress);
    });
    return () => {
      sub?.remove();
      previewPlayerRef.current?.remove();
      previewPlayerRef.current = null;
    };
  }, []);

  const stopPreview = useCallback(() => {
    const p = previewPlayerRef.current;
    if (p) {
      try {
        p.pause();
        p.remove();
      } catch {
        // Already released.
      }
      previewPlayerRef.current = null;
    }
    setPreviewing(false);
  }, []);

  const preview = useCallback(
    async (clips: LocalClip[], range: TimeRange, op: RangeOp): Promise<boolean> => {
      if (!available) return false;
      stopPreview();
      const targets = clipsInRange(clips, range);
      const first = targets[0];
      if (!first) return false;
      const source = segmentsRef.current.find((s) => s.id === first.clip.segmentId);
      if (!source) return false;
      setPreviewing(true);
      const tPreview = Date.now();
      try {
        const inPath = await ensureLocalSource(source);
        const seconds = studioPrefs.previewSeconds();
        const rendered = await withTimeout(
          previewRange(
            inPath,
            first.fileStartMs / 1000,
            first.fileEndMs / 1000,
            op,
            seconds
          ),
          RENDER_TIMEOUT_MS
        );
        if (!rendered) throw new Error('The audio processor is not in this build');
        const player = createAudioPlayer(
          {
            uri: rendered.outputPath.startsWith('file://')
              ? rendered.outputPath
              : `file://${rendered.outputPath}`,
          },
          { keepAudioSessionActive: true }
        );
        previewPlayerRef.current = player;
        player.addListener('playbackStatusUpdate', (status) => {
          if (status.didJustFinish) stopPreview();
        });
        player.play();
        analytics.capture(ANALYTICS_EVENTS.PROJECT.RANGE_EFFECT, {
          phase: 'previewed',
          op: op.type,
          project_id: projectId,
          ms: Date.now() - tPreview,
          preview_sec: seconds,
        });
        return true;
      } catch (error: unknown) {
        setPreviewing(false);
        showToast(tx('studio.effects.previewFailed', 'Could not render the preview'));
        analytics.capture(ANALYTICS_EVENTS.PROJECT.RANGE_EFFECT, {
          phase: 'preview_failed',
          op: op.type,
          project_id: projectId,
          ms: Date.now() - tPreview,
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    },
    [available, stopPreview, projectId]
  );

  const apply = useCallback(
    async (clips: LocalClip[], range: TimeRange, op: RangeOp): Promise<boolean> => {
      const runId = `${Date.now().toString(36)}`;
      const step = (phase: string, props: Record<string, unknown> = {}) =>
        track(phase, { ...base, ...props });
      const base = {
        run_id: runId,
        op: op.type,
        project_id: projectId,
        range_ms: Math.round(range.endMs - range.startMs),
        lane_index: range.laneIndex,
        params: op,
      };
      if (busyRef.current) {
        step('skipped', { reason: 'busy' });
        return false;
      }
      setLastError(null);
      if (!available) {
        step('skipped', { reason: 'processor_unavailable' });
        setLastError(
          tx('studio.effects.unavailable', 'This build has no audio processor')
        );
        return false;
      }
      stopPreview();
      const targets = clipsInRange(clips, range);
      if (targets.length === 0) {
        step('skipped', { reason: 'no_clip_in_range', clip_count: clips.length });
        setLastError(tx('studio.effects.noAudio', 'The selected range has no audio'));
        return false;
      }
      step('picked', { target_count: targets.length, clip_count: clips.length });
      busyRef.current = true;
      setBusy(true);
      setProgress(0);
      const t0 = Date.now();
      let phase = 'lookup';
      try {
        for (const { clip, fileStartMs, fileEndMs } of targets) {
          const source = segmentsRef.current.find((s) => s.id === clip.segmentId);
          if (!source) throw new Error(`Segment ${clip.segmentId} missing`);
          phase = 'download';
          const tSource = Date.now();
          const inPath = await ensureLocalSource(source);
          step('source_ready', {
            clip_id: clip.id,
            segment_id: clip.segmentId,
            ms: Date.now() - tSource,
            remote: !source.downloadUrl.startsWith('file'),
          });
          phase = 'render';
          const tRender = Date.now();
          const rendered = await withTimeout(
            processRange(
              inPath,
              fileStartMs / 1000,
              fileEndMs / 1000,
              op,
              `rx-${clip.id}-${Date.now()}`
            ),
            RENDER_TIMEOUT_MS
          );
          if (!rendered) throw new Error('The audio processor is not in this build');
          step('rendered', {
            clip_id: clip.id,
            ms: Date.now() - tRender,
            process_ms: rendered.processMs,
            duration_sec: rendered.durationSec,
            noop: rendered.noop,
          });
          // The render is canonical CAF; the pipeline (and the upload
          // endpoint) speak 8 kHz mono WAV, so convert before sending. The
          // backend rejects audio/x-caf outright.
          phase = 'convert';
          const tConvert = Date.now();
          let uploadPath = rendered.outputPath;
          let uploadName = `rx-${clip.id}.caf`;
          let uploadMime = 'audio/x-caf';
          if (isTranscodeAvailable()) {
            const wavPath = `${FileSystem.cacheDirectory}rx-out-${clip.id}-${Date.now()}.wav`;
            const converted = await toTelephonyWav(rendered.outputPath, wavPath);
            if (converted && converted.outputBytes > 0) {
              uploadPath = converted.outputPath;
              uploadName = `rx-${clip.id}.wav`;
              uploadMime = 'audio/wav';
            }
          }
          step('converted', {
            clip_id: clip.id,
            ms: Date.now() - tConvert,
            mime: uploadMime,
          });
          phase = 'upload';
          const tUpload = Date.now();
          const uploaded = await projectService.uploadSegmentOnly(
            projectId,
            uploadPath,
            uploadName,
            uploadMime
          );
          if (!uploaded?.id) throw new Error('Upload returned no segment id');
          step('uploaded', { clip_id: clip.id, ms: Date.now() - tUpload });
          const renderedMs = Math.round(rendered.durationSec * 1000);
          addSegment({
            ...(uploaded as AudioSegment),
            id: uploaded.id,
            durationMs: uploaded.durationMs || renderedMs,
            downloadUrl: uploadPath,
          });
          phase = 'patch';
          // The render keeps the file's timeline outside the window, so the
          // clip's in point is unchanged; only the length of the window can
          // move the out point.
          const oldSegmentMs = source.durationMs || clip.endInSegment;
          const lengthDelta = renderedMs - oldSegmentMs;
          replaceClipSource({
            clipId: clip.id,
            segmentId: uploaded.id,
            sourceSegmentId: clip.sourceSegmentId ?? clip.segmentId,
            startInSegment: clip.startInSegment,
            endInSegment: Math.max(
              clip.startInSegment + 1,
              clip.endInSegment + lengthDelta
            ),
            ripple: true,
          });
          step('patched', { clip_id: clip.id, new_segment_id: uploaded.id });
        }
        step('applied', { target_count: targets.length, total_ms: Date.now() - t0 });
        showToast(tx('studio.effects.applied', 'Effect applied'));
        return true;
      } catch (error: unknown) {
        step('failed', {
          failed_phase: phase,
          error: error instanceof Error ? error.message : String(error),
          error_code: (error as { code?: string })?.code ?? null,
          total_ms: Date.now() - t0,
        });
        setLastError(
          `${phase}: ${error instanceof Error ? error.message : String(error)}`
        );
        if (phase === 'download' || phase === 'upload') {
          void showNetFailureToast(error, tx('effects.action', 'Applying effects'));
        }
        return false;
      } finally {
        busyRef.current = false;
        setBusy(false);
        setProgress(null);
      }
    },
    [available, projectId, addSegment, replaceClipSource, stopPreview]
  );

  return {
    apply,
    preview,
    stopPreview,
    busy,
    previewing,
    progress,
    available,
    lastError,
  };
}
