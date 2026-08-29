import { useCallback, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { showToast } from '@/components/ui/Toast';
import { showNetFailureToast } from '@/components/ui/netToast';
import { projectService } from '@/lib/api/projectService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
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
        phase = 'download';
        const inPath = `${FileSystem.cacheDirectory}fx-src-${sourceId}.wav`;
        const info = await FileSystem.getInfoAsync(inPath);
        if (!info.exists) {
          const dl = await FileSystem.downloadAsync(source.downloadUrl, inPath);
          if (dl.status < 200 || dl.status >= 300) {
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
        void FileSystem.deleteAsync(outPath, { idempotent: true }).catch(() => {});
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
