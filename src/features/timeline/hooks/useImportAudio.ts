import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import * as DocumentPicker from 'expo-document-picker';
import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system/legacy';
import {
  toTelephonyWav,
  isTranscodeAvailable,
} from '../../../../modules/atto-audio-transcode';
import { showToast } from '@/components/ui/Toast';
import { projectService } from '@/lib/api/projectService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { serverClipToLocal } from '../types';
import type { LocalClip } from '../types';

interface UseImportAudioOptions {
  projectId: string;
  activeLaneIndex: number;
  /** Called with the freshly-added clip so the reducer can append it. */
  addClip: (clip: LocalClip) => void;
}

/** Live progress for the modal. `pct` is 0..1 across the whole import. */
export interface ImportProgress {
  pct: number;
  stage: 'preparing' | 'uploading' | 'processing';
  bytesSent: number;
  totalBytes: number;
  etaMs: number | null;
  stalled: boolean;
}

/**
 * Absolute ceiling, scaled by file size. The old flat 90s was unreachable by
 * construction for big files: the backend accepts up to 50MB, and at the measured
 * 549 KB/s a 50MB upload needs ~91s, so a healthy large import was GUARANTEED to
 * report a timeout. Now: at least 90s, plus headroom for a genuinely slow link.
 */
function ceilingMsFor(sizeBytes: number | null): number {
  if (!sizeBytes || sizeBytes <= 0) return 90_000;
  return Math.max(90_000, Math.round(sizeBytes / 40_000) * 1000);
}

/** No byte movement for this long = give up, even if the ceiling hasn't hit. */
const STALL_ABORT_MS = 60_000;
/** No byte movement for this long = tell the user the connection looks slow. */
const STALL_WARN_MS = 15_000;

export function useImportAudio({
  projectId,
  activeLaneIndex,
  addClip,
}: UseImportAudioOptions) {
  const { t } = useTranslation('common');
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Monotonic guard: a corrected total or a retransmit must never walk the bar back.
  const maxPctRef = useRef(0);

  // Never leave a request in flight if the screen goes away.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  /** User-facing cancel — aborts the in-flight upload and closes the modal. */
  const cancelImport = useCallback(() => {
    analytics.capture(ANALYTICS_EVENTS.PROJECT.AUDIO_IMPORT, {
      outcome: 'cancelled',
    });
    abortRef.current?.abort();
    abortRef.current = null;
    setIsImporting(false);
    setProgress(null);
  }, []);

  const importAudio = useCallback(async () => {
    // Phase timers. The old code measured ONE number (total) starting AFTER the
    // picker, so the picker's own copy-to-cache of a 27MB file was invisible, and
    // network time could not be told apart from server time. Every leg is now
    // separately timed (David, Aug 2: "por qué se tarda tanto en importarlo").
    const tPickerStart = Date.now();
    let pickerMs: number | null = null;
    let uploadMs: number | null = null;
    let serverTailMs: number | null = null;
    let startedAt = 0;
    let sizeBytes: number | null = null;
    let lastByteAt = 0;
    let peakBytesSent = 0;
    let networkType: string | null = null;
    let cellularGeneration: string | null = null;
    let transcoded = false;

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'audio/wav',
          'audio/x-wav',
          'audio/mpeg',
          'audio/mp3',
          'audio/mp4',
          'audio/m4a',
          'audio/x-m4a',
          'audio/aac',
        ],
        copyToCacheDirectory: true,
      });
      // Includes the OS copying the file into our cache — for a 27MB WAV that is
      // real, user-visible time that nothing used to measure.
      pickerMs = Date.now() - tPickerStart;

      if (result.canceled) {
        analytics.capture(ANALYTICS_EVENTS.PROJECT.AUDIO_IMPORT, {
          outcome: 'picker_cancelled',
          picker_ms: pickerMs,
        });
        return;
      }

      const file = result.assets[0];
      if (!file) {
        analytics.capture(ANALYTICS_EVENTS.PROJECT.AUDIO_IMPORT, {
          outcome: 'no_file',
          picker_ms: pickerMs,
        });
        return;
      }

      sizeBytes = file.size ?? null;
      startedAt = Date.now();
      lastByteAt = startedAt;
      maxPctRef.current = 0;

      // Network conditions decide how every duration below should be read.
      try {
        const net = await NetInfo.fetch();
        networkType = net.type ?? null;
        cellularGeneration =
          (net.details as { cellularGeneration?: string } | null)?.cellularGeneration ??
          null;
      } catch {
        // Non-fatal.
      }

      analytics.capture(ANALYTICS_EVENTS.PROJECT.AUDIO_IMPORT, {
        outcome: 'started',
        size_bytes: sizeBytes,
        mime_type: file.mimeType ?? null,
        picker_ms: pickerMs,
        network_type: networkType,
        cellular_generation: cellularGeneration,
        upload_api: 'legacy_upload_task',
        session_type: 'foreground',
      });

      setIsImporting(true);
      setProgress({
        pct: 0,
        stage: 'preparing',
        bytesSent: 0,
        totalBytes: sizeBytes ?? 0,
        etaMs: null,
        stalled: false,
      });

      // ── Shrink the upload before it starts ──
      // The backend converts every import to 8 kHz mono anyway, so uploading a
      // 27.1 MB WAV to produce a 2.46 MB artifact was ~11x wasted bytes AND a
      // wasted server-side ffmpeg pass. Converting here means far fewer bytes on
      // the wire and a file the server can store as-is (it probes for exactly this
      // format). Only worth it for uncompressed sources: mp3/m4a/aac are already
      // small, and re-encoding them would cost quality for almost no size win.
      let uploadUri = file.uri;
      let uploadName = file.name;
      let uploadMime = file.mimeType ?? 'audio/wav';
      const lower = (file.name || '').toLowerCase();
      const isUncompressed =
        /\.(wav|aif|aiff|caf)$/.test(lower) ||
        /wav|aiff|x-caf/i.test(file.mimeType ?? '');
      const bigEnoughToBother = (sizeBytes ?? 0) > 2 * 1024 * 1024;

      if (isTranscodeAvailable() && isUncompressed && bigEnoughToBother) {
        const outPath = `${FileSystem.cacheDirectory}import-8k-${Date.now()}.wav`;
        const tr = await toTelephonyWav(file.uri, outPath);
        if (tr && tr.outputBytes > 0) {
          uploadUri = tr.outputPath;
          uploadName = uploadName.replace(/\.[^.]+$/, '') + '.wav';
          uploadMime = 'audio/wav';
          sizeBytes = tr.outputBytes;
          transcoded = true;
          analytics.capture(ANALYTICS_EVENTS.PROJECT.AUDIO_TRANSCODE, {
            outcome: 'succeeded',
            source_bytes: tr.inputBytes,
            output_bytes: tr.outputBytes,
            ratio:
              tr.inputBytes > 0 ? +(tr.inputBytes / tr.outputBytes).toFixed(2) : null,
            encode_ms: tr.encodeMs,
            duration_ms: tr.durationMs,
            source_mime: file.mimeType ?? null,
          });
          setProgress((p) => (p ? { ...p, totalBytes: tr.outputBytes } : p));
        } else {
          // Best effort only — fall through and upload the original, which is
          // exactly the previous behaviour.
          analytics.capture(ANALYTICS_EVENTS.PROJECT.AUDIO_TRANSCODE, {
            outcome: 'failed_fallback_to_original',
            source_bytes: sizeBytes,
            source_mime: file.mimeType ?? null,
          });
        }
      }

      const controller = new AbortController();
      abortRef.current = controller;

      // Two independent guards, both needed: a stall watchdog (no bytes moved for
      // 60s) and a size-scaled absolute ceiling. A flat timeout alone either kills
      // healthy large uploads or lets a dead connection hang.
      const ceiling = ceilingMsFor(sizeBytes);
      const ceilingId = setTimeout(() => controller.abort(), ceiling);
      const stallId = setInterval(() => {
        const idleMs = Date.now() - lastByteAt;
        if (idleMs >= STALL_ABORT_MS) {
          controller.abort();
          return;
        }
        if (idleMs >= STALL_WARN_MS) {
          setProgress((p) => (p ? { ...p, stalled: true } : p));
        }
      }, 2_000);

      // EWMA throughput for a stable ETA (the instantaneous rate swings wildly).
      let ewmaBps = 0;
      let lastSampleAt = startedAt;
      let lastSampleBytes = 0;
      // Sample progress into telemetry by decile only, so a long upload emits ~10
      // events instead of hundreds.
      let lastDecileLogged = -1;
      const tUploadStart = Date.now();

      let clip;
      try {
        clip = await projectService.uploadAudio(
          projectId,
          uploadUri,
          uploadName,
          uploadMime,
          activeLaneIndex,
          controller.signal,
          ({ bytesSent, totalBytes }) => {
            const now = Date.now();
            if (bytesSent > peakBytesSent) {
              peakBytesSent = bytesSent;
              lastByteAt = now;
            }
            // iOS reports -1 for an unknown total; fall back to the picked size.
            const total = totalBytes > 0 ? totalBytes : (sizeBytes ?? 0);
            const dt = now - lastSampleAt;
            if (dt > 250) {
              const inst = ((bytesSent - lastSampleBytes) * 1000) / dt;
              ewmaBps = ewmaBps === 0 ? inst : ewmaBps * 0.7 + inst * 0.3;
              lastSampleAt = now;
              lastSampleBytes = bytesSent;
            }
            // Bytes map to 0..90%. The last 10% belongs to the server tail, so the
            // bar never sits at 100% while ffmpeg and storage are still working.
            const raw = total > 0 ? (bytesSent / total) * 0.9 : 0;
            const pct = Math.max(maxPctRef.current, Math.min(0.9, raw));
            maxPctRef.current = pct;
            const remaining = total > 0 ? Math.max(0, total - bytesSent) : 0;
            const etaMs =
              ewmaBps > 0 && remaining > 0 && now - startedAt > 3_000
                ? Math.round((remaining / ewmaBps) * 1000)
                : null;
            setProgress({
              pct,
              stage: total > 0 && bytesSent >= total ? 'processing' : 'uploading',
              bytesSent,
              totalBytes: total,
              etaMs,
              stalled: false,
            });

            const decile = Math.floor((pct / 0.9) * 10);
            if (decile > lastDecileLogged && total > 0) {
              lastDecileLogged = decile;
              analytics.capture(ANALYTICS_EVENTS.PROJECT.AUDIO_UPLOAD_PROGRESS, {
                decile,
                bytes_sent: bytesSent,
                total_bytes: total,
                elapsed_ms: now - startedAt,
                throughput_bps: Math.round(ewmaBps),
                network_type: networkType,
              });
            }
          }
        );
      } finally {
        clearTimeout(ceilingId);
        clearInterval(stallId);
      }

      // Split network time from server time: the last byte leaving the phone is
      // NOT the end of the import — the gateway buffers, ffmpeg transcodes and
      // storage writes all happen after it, and that tail was invisible before.
      const tResponse = Date.now();
      uploadMs = Math.max(0, lastByteAt - tUploadStart);
      serverTailMs = Math.max(0, tResponse - lastByteAt);

      setProgress((p) => (p ? { ...p, pct: 1, stage: 'processing' } : p));

      addClip(serverClipToLocal(clip));
      analytics.capture(ANALYTICS_EVENTS.PROJECT.AUDIO_IMPORT, {
        outcome: 'succeeded',
        size_bytes: sizeBytes,
        duration_ms: Date.now() - startedAt,
        picker_ms: pickerMs,
        upload_ms: uploadMs,
        server_tail_ms: serverTailMs,
        throughput_bps:
          uploadMs > 0 && sizeBytes ? Math.round((sizeBytes * 1000) / uploadMs) : null,
        network_type: networkType,
        cellular_generation: cellularGeneration,
        upload_api: 'legacy_upload_task',
        session_type: 'foreground',
        transcoded,
      });
      showToast(t('toasts.audioImported'));
    } catch (error: unknown) {
      const aborted =
        (error as { name?: string } | null)?.name === 'AbortError' ||
        abortRef.current === null;
      const msg = error instanceof Error ? error.message : String(error);
      // A user cancel already reported itself; only report real failures/timeouts.
      if (!aborted || startedAt > 0) {
        analytics.capture(ANALYTICS_EVENTS.PROJECT.AUDIO_IMPORT, {
          outcome: aborted ? 'aborted_or_timeout' : 'failed',
          error: msg,
          size_bytes: sizeBytes,
          duration_ms: startedAt ? Date.now() - startedAt : null,
          picker_ms: pickerMs,
          // How far it got before dying — distinguishes "never connected" from
          // "died at 80%".
          bytes_sent_at_failure: peakBytesSent,
          pct_at_failure: Math.round(maxPctRef.current * 100),
          network_type: networkType,
          cellular_generation: cellularGeneration,
        });
      }
      if (!aborted) {
        showToast(t('toasts.importFailed', { message: msg }));
      }
    } finally {
      abortRef.current = null;
      setIsImporting(false);
      setProgress(null);
    }
  }, [projectId, activeLaneIndex, addClip, t]);

  return { importAudio, isImporting, cancelImport, progress };
}
