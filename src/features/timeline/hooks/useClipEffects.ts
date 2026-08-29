import { useCallback, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { showToast } from '@/components/ui/Toast';
import { showNetFailureToast } from '@/components/ui/netToast';
import { projectService } from '@/lib/api/projectService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { withTimeout } from '@/lib/net/connectivity';
import i18n from '@/lib/i18n';
import {
  renderEffects,
  isEffectsRenderAvailable,
  isEffectChainEmpty,
  type EffectChain,
} from '../../../../modules/atto-audio-transcode';
import type { AudioSegment } from '@/types/call';
import type { LocalClip, ClipEffectsPatch } from '../types';

// ClipEffectsPatch (the exact three fields the reducer's PATCH_CLIP_EFFECTS
// rewrites) lives in ../types next to LocalClip; re-exported for callers.
export type { ClipEffectsPatch };

interface UseClipEffectsOptions {
  projectId: string;
  /** Project segments, with download URLs, so the DRY source can be fetched. */
  segments: (AudioSegment & { downloadUrl: string })[];
  /** Register a freshly uploaded render so waveform + playback can resolve it. */
  addSegment: (segment: AudioSegment & { downloadUrl: string }) => void;
  /** Apply the swap to the clip in timeline state (undoable, marks dirty). */
  patchClip: (clipId: string, patch: ClipEffectsPatch) => void;
}

const tx = (key: string, def: string): string =>
  i18n.t(`projects:${key}`, { defaultValue: def });

/** A dead connection must not lock the Effects sheet in `busy` forever. */
const SOURCE_DOWNLOAD_TIMEOUT_MS = 60_000;
/** Cached dry sources / renders older than this are evicted before an apply. */
const STALE_RENDER_MAX_AGE_MS = 24 * 60 * 60 * 1000;
let sweptThisProcess = false;

/**
 * Evict old fx-src-* / fx-out-* files from the cache directory, once per
 * process. An 8 kHz 16-bit take is ~1 MB per minute, so without this every
 * source ever effected accumulated on disk until iOS storage pressure hit.
 * Best effort: a failure here never blocks an apply.
 */
async function sweepStaleRenders(): Promise<void> {
  if (sweptThisProcess || !FileSystem.cacheDirectory) return;
  sweptThisProcess = true;
  try {
    const names = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory);
    const cutoff = Date.now() - STALE_RENDER_MAX_AGE_MS;
    await Promise.all(
      names
        .filter((n) => n.startsWith('fx-src-') || n.startsWith('fx-out-'))
        .map(async (n) => {
          const path = `${FileSystem.cacheDirectory}${n}`;
          const info = await FileSystem.getInfoAsync(path);
          const modified =
            info.exists &&
            'modificationTime' in info &&
            typeof info.modificationTime === 'number'
              ? info.modificationTime * 1000
              : 0;
          if (modified > 0 && modified < cutoff) {
            await FileSystem.deleteAsync(path, { idempotent: true });
          }
        })
    );
  } catch {
    // Cache housekeeping only.
  }
}

/**
 * useClipEffects — the NON-DESTRUCTIVE effects flow for one clip:
 *
 *   dry source segment → download → native offline render (Apple AUs) →
 *   upload as a NEW segment → point the clip at it, remembering the dry
 *   original in `sourceSegmentId` and the chain in `effects`.
 *
 * Re-applying always renders from the DRY original (never stacks effects on a
 * previous render), and "remove" is just pointing the clip back at that
 * original, so every step is reversible and the export needs no server DSP:
 * it mixes whatever `segmentId` says, so preview == export by construction.
 *
 * The clip's in/out window (startInSegment/endInSegment) is left untouched: the
 * render keeps the source's timeline (rate is pinned to 1) and only appends a
 * decay tail, so the take stays exactly where the user placed it. The tail is
 * audible only if the user extends the clip's end.
 */
export function useClipEffects({
  projectId,
  segments,
  addSegment,
  patchClip,
}: UseClipEffectsOptions) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;

  const available = isEffectsRenderAvailable();

  const applyEffects = useCallback(
    async (clip: LocalClip, chain: EffectChain): Promise<boolean> => {
      if (busyRef.current) return false;
      if (!available || isEffectChainEmpty(chain)) return false;
      busyRef.current = true;
      setBusy(true);
      const t0 = Date.now();
      const sourceId = clip.sourceSegmentId ?? clip.segmentId;
      const source = segmentsRef.current.find((s) => s.id === sourceId);
      let phase = 'lookup';
      try {
        if (!source?.downloadUrl) {
          throw new Error(`Source segment ${sourceId} has no download URL`);
        }

        // 1. Fetch the DRY original to the cache (renders never read a render).
        // A cached copy is trusted only if it is a plausible WAV (bigger than a
        // header): downloadAsync writes the response body even on a 403/5xx, and
        // an interrupted transfer leaves a truncated file, so "exists" alone
        // would poison every later apply of this source. Bounded by a timeout so
        // a dead connection cannot lock the sheet in `busy` forever.
        phase = 'download';
        await sweepStaleRenders();
        const inPath = `${FileSystem.cacheDirectory}fx-src-${sourceId}.wav`;
        const info = await FileSystem.getInfoAsync(inPath);
        const cachedOk =
          info.exists &&
          'size' in info &&
          typeof info.size === 'number' &&
          info.size > 1024;
        if (!cachedOk) {
          await FileSystem.deleteAsync(inPath, { idempotent: true }).catch(() => {});
          let dl: FileSystem.FileSystemDownloadResult;
          try {
            dl = await withTimeout(
              FileSystem.downloadAsync(source.downloadUrl, inPath),
              SOURCE_DOWNLOAD_TIMEOUT_MS
            );
          } catch (e: unknown) {
            await FileSystem.deleteAsync(inPath, { idempotent: true }).catch(() => {});
            throw e;
          }
          if (dl.status < 200 || dl.status >= 300) {
            await FileSystem.deleteAsync(inPath, { idempotent: true }).catch(() => {});
            throw new Error(`Source download failed (${dl.status})`);
          }
        }

        // 2. Render on-device, offline.
        phase = 'render';
        const outPath = `${FileSystem.cacheDirectory}fx-out-${clip.id}-${Date.now()}.wav`;
        const rendered = await renderEffects(inPath, outPath, chain);
        if (!rendered) throw new Error('Render unavailable or failed');

        // 3. Store the render as a new segment (no clip).
        phase = 'upload';
        const uploaded = await projectService.uploadSegmentOnly(
          projectId,
          rendered.outputPath,
          `fx-${clip.id}.wav`,
          'audio/wav'
        );
        if (!uploaded?.id) throw new Error('Upload returned no segment id');

        // The backend response carries no presigned URL; the render is already on
        // disk, so playback/waveform can use the local file until the next project
        // refetch replaces it with the server copy.
        addSegment({
          ...(uploaded as AudioSegment),
          id: uploaded.id,
          durationMs: uploaded.durationMs || rendered.durationMs,
          downloadUrl: rendered.outputPath,
        });

        // 4. Swap the clip (undoable in the reducer).
        phase = 'patch';
        patchClip(clip.id, {
          segmentId: uploaded.id,
          sourceSegmentId: sourceId,
          effects: chain,
        });

        analytics.capture(ANALYTICS_EVENTS.PROJECT.CLIP_EFFECTS, {
          action: 'apply',
          outcome: 'ok',
          applied: rendered.applied,
          render_ms: rendered.renderMs,
          output_bytes: rendered.outputBytes,
          total_ms: Date.now() - t0,
          clip_ms: clip.endInSegment - clip.startInSegment,
        });
        showToast(tx('effects.applied', 'Effects applied'));
        // The render stays on disk: it IS the segment's playable source until the
        // next project refetch (see addSegment above). sweepStaleRenders() evicts
        // it once it is a day old.
        return true;
      } catch (error: unknown) {
        analytics.capture(ANALYTICS_EVENTS.PROJECT.CLIP_EFFECTS, {
          action: 'apply',
          outcome: 'failed',
          phase,
          error: error instanceof Error ? error.message : String(error),
          total_ms: Date.now() - t0,
        });
        if (phase === 'download' || phase === 'upload') {
          void showNetFailureToast(error, tx('effects.action', 'Applying effects'));
        } else {
          showToast(
            tx('effects.failed', 'Could not apply effects. Your take is unchanged.')
          );
        }
        return false;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [available, projectId, addSegment, patchClip]
  );

  const removeEffects = useCallback(
    async (clip: LocalClip): Promise<boolean> => {
      if (!clip.sourceSegmentId) return false;
      patchClip(clip.id, {
        segmentId: clip.sourceSegmentId,
        sourceSegmentId: null,
        effects: null,
      });
      analytics.capture(ANALYTICS_EVENTS.PROJECT.CLIP_EFFECTS, {
        action: 'remove',
        outcome: 'ok',
      });
      showToast(tx('effects.removed', 'Effects removed'));
      return true;
    },
    [patchClip]
  );

  return { applyEffects, removeEffects, busy, available };
}
