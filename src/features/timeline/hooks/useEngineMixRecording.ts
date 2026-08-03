import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';

import { showToast } from '@/components/ui/Toast';
import { useCallStore } from '@/stores/callStore';
import { useMixerStore } from '@/stores/mixerStore';
import { mixerService } from '@/lib/callAudio/mixerService';
import { projectService } from '@/lib/api/projectService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { emitTelemetryMarker } from '@/lib/telemetry/callTelemetry';
import {
  toTelephonyWav,
  isTranscodeAvailable,
} from '../../../../modules/atto-audio-transcode';
import * as FileSystem from 'expo-file-system/legacy';
import type { LocalClip } from '../types';

interface UseEngineMixRecordingOptions {
  projectId: string;
  activeLaneIndex: number;
  /** Kept for interface parity with useTwilioCallRecording. */
  addClip: (clip: LocalClip) => void;
  /**
   * Where on the timeline this take belongs, in ms — read at STOP time but
   * snapshotted by the caller at record START (the playhead the performance was
   * sung against).
   */
  getRecordStartMs?: () => number;
}

/**
 * In-call recording through the ENGINE MIXER, as an alternative to the
 * server-side Twilio Media Stream fork (useTwilioCallRecording).
 *
 * WHY THIS EXISTS. The Twilio fork records the call as the far party hears it,
 * which necessarily INCLUDES anything we injected into the uplink. So a take sung
 * over an injected backing track already contains that backing track; layering it
 * back onto the same track in the timeline gives the track twice, slightly
 * offset, comb-filtered, with the far party underneath. That is the flagship
 * "sing over the beat" flow, and it could not work through that path.
 *
 * The engine mixer records per channel — mic / remote / app / metronome — each
 * with its own gain and its own record-enable, and the app channel defaults OFF.
 * Recording mic + remote therefore yields a CLEAN overdub that layers correctly.
 * The user changes any of it from the mixer sheet.
 *
 * Interface is deliberately identical to useTwilioCallRecording so TimelineEditor
 * can pick between them without any other code changing.
 *
 * TRADE-OFF, stated honestly: this recording lives on the device until it is
 * uploaded, so if the app is killed mid-take the audio is lost, whereas the
 * server-side fork survives that. The mitigation is that the file is written
 * incrementally by the native consumer, so a partial take is still on disk.
 */
export function useEngineMixRecording({
  projectId,
  activeLaneIndex,
  addClip: _addClip,
  getRecordStartMs,
}: UseEngineMixRecordingOptions) {
  const { t } = useTranslation('common');
  const queryClient = useQueryClient();
  const activeCall = useCallStore((s) => s.activeCall);
  const setMixRecording = useMixerStore((s) => s.setMixRecording);

  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  const activeLaneRef = useRef(activeLaneIndex);
  activeLaneRef.current = activeLaneIndex;
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;
  const getRecordStartMsRef = useRef(getRecordStartMs);
  getRecordStartMsRef.current = getRecordStartMs;
  /**
   * Synchronous re-entrancy latch. isRecording only flips after the async arm
   * resolves, so a double tap could start two takes; a ref guards where state
   * cannot. Same lesson as useTwilioCallRecording's armingRef.
   */
  const armingRef = useRef(false);

  // Tick the elapsed counter for the toolbar label and the live placeholder.
  useEffect(() => {
    if (!isRecording) return;
    const start = Date.now();
    setElapsed(0);
    setElapsedMs(0);
    const id = setInterval(() => {
      const ms = Date.now() - start;
      setElapsedMs(ms);
      setElapsed(Math.floor(ms / 1000));
    }, 100);
    return () => clearInterval(id);
  }, [isRecording]);

  const startRecording = useCallback(async () => {
    if (isRecording || isUploading || armingRef.current) return;
    armingRef.current = true;
    const t0 = Date.now();
    try {
      const path = await mixerService.startMixRecording();
      if (!path) {
        // Native unavailable or the engine is not Twilio's active device.
        analytics.capture(ANALYTICS_EVENTS.CALL.AUDIO_MIX_RECORD, {
          action: 'start',
          engine: 'engine_mix',
          outcome: 'native_unavailable',
          call_sid: activeCall?.callSid ?? null,
          start_latency_ms: Date.now() - t0,
        });
        showToast(t('toasts.recordingFailed', 'Recording failed'));
        armingRef.current = false;
        return;
      }
      setIsRecording(true);
      setMixRecording(true);
      // Which channels the user actually armed — so a "she isn't on the
      // recording" report is answerable from data instead of memory.
      const channels = useMixerStore.getState().channels;
      analytics.capture(ANALYTICS_EVENTS.CALL.AUDIO_MIX_RECORD, {
        action: 'start',
        engine: 'engine_mix',
        outcome: 'ok',
        call_sid: activeCall?.callSid ?? null,
        start_latency_ms: Date.now() - t0,
        rec_mic: channels.mic.record,
        rec_remote: channels.remote.record,
        rec_app: channels.app.record,
        rec_metronome: channels.metronome.record,
        gain_mic: channels.mic.gain,
        gain_remote: channels.remote.gain,
        gain_app: channels.app.gain,
      });
      void emitTelemetryMarker('engine_mix_record_started');
    } catch (error: unknown) {
      analytics.capture(ANALYTICS_EVENTS.CALL.AUDIO_MIX_RECORD, {
        action: 'start',
        engine: 'engine_mix',
        outcome: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
      showToast(t('toasts.recordingFailed', 'Recording failed'));
      armingRef.current = false;
    }
  }, [isRecording, isUploading, activeCall, setMixRecording, t]);

  const stopRecording = useCallback(async () => {
    if (!isRecording) return;
    // Flip the UI immediately; the file work below takes seconds.
    setIsRecording(false);
    setIsUploading(true);
    setMixRecording(false);

    const takeMs = elapsedMs;
    let outcome = 'ok';
    let transcodedBytes: number | null = null;

    try {
      const rawPath = await mixerService.stopMixRecording();
      // The ONLY window into what the engine actually captured. remote_frames≈0
      // means the far party never reached the mix, whatever the UI showed.
      const diag = await mixerService.getMixDiagnostics();

      if (!rawPath) {
        outcome = 'no_path';
        showToast(t('toasts.recordingFailed', 'Recording failed'));
        return;
      }

      const srcUri = rawPath.startsWith('file://') ? rawPath : `file://${rawPath}`;

      // Normalise to the pipeline's format (8 kHz mono WAV) on device. The
      // backend converts to this anyway, so doing it here means a far smaller
      // upload AND the server can skip its ffmpeg pass. Best effort: on failure
      // we upload the raw engine file and let the server normalise it.
      let uploadUri = srcUri;
      let uploadName = `take-${Date.now()}.wav`;
      if (isTranscodeAvailable()) {
        const outPath = `${FileSystem.cacheDirectory}take-8k-${Date.now()}.wav`;
        const tr = await toTelephonyWav(srcUri, outPath);
        if (tr && tr.outputBytes > 0) {
          uploadUri = tr.outputPath;
          transcodedBytes = tr.outputBytes;
          analytics.capture(ANALYTICS_EVENTS.PROJECT.AUDIO_TRANSCODE, {
            outcome: 'succeeded',
            source: 'engine_mix_take',
            source_bytes: tr.inputBytes,
            output_bytes: tr.outputBytes,
            encode_ms: tr.encodeMs,
            duration_ms: tr.durationMs,
          });
        }
      }

      const position = getRecordStartMsRef.current?.();
      const clip = await projectService.uploadAudio(
        projectIdRef.current,
        uploadUri,
        uploadName,
        'audio/wav',
        activeLaneRef.current,
        undefined,
        undefined,
        position
      );

      analytics.capture(ANALYTICS_EVENTS.CALL.RECORDING_PLACED, {
        phase: 'uploaded',
        engine: 'engine_mix',
        clip_id: clip?.id ?? null,
        requested_position_ms: typeof position === 'number' ? position : null,
        lane_index: activeLaneRef.current,
        take_ms: takeMs,
        output_bytes: transcodedBytes,
      });

      queryClient.invalidateQueries({ queryKey: ['project', projectIdRef.current] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      showToast(t('toasts.recordingAdded', 'Recording added to timeline'));

      analytics.capture(ANALYTICS_EVENTS.CALL.AUDIO_MIX_RECORD, {
        action: 'stop',
        engine: 'engine_mix',
        outcome: 'ok',
        call_sid: activeCall?.callSid ?? null,
        duration_ms: takeMs,
        mic_frames: diag?.micFrames ?? null,
        remote_frames: diag?.remoteFrames ?? null,
        app_frames: diag?.appFrames ?? null,
        total_frames: diag?.totalFrames ?? null,
        engine_duration_sec: diag?.durationSec ?? null,
        // 0 ⇒ the custom device was not Twilio's active device (engine inert).
        record_cb_count: diag?.recordCbCount ?? null,
        playout_cb_count: diag?.playoutCbCount ?? null,
        // >0 ⇒ the manual mix render failed and the guard sent raw mic instead.
        render_fail_count: diag?.renderFailCount ?? null,
        resume_starved_count: diag?.resumeStarvedCount ?? null,
      });
    } catch (error: unknown) {
      outcome = 'failed';
      const msg = error instanceof Error ? error.message : String(error);
      analytics.capture(ANALYTICS_EVENTS.CALL.AUDIO_MIX_RECORD, {
        action: 'stop',
        engine: 'engine_mix',
        outcome: 'failed',
        error: msg,
        duration_ms: takeMs,
      });
      showToast(t('toasts.recordingFailed', 'Recording failed') + `: ${msg}`);
    } finally {
      setIsUploading(false);
      armingRef.current = false;
      void emitTelemetryMarker('engine_mix_record_ended', { outcome });
    }
  }, [isRecording, elapsedMs, activeCall, setMixRecording, queryClient, t]);

  return {
    startRecording,
    stopRecording,
    isRecording,
    isUploading,
    elapsed,
    elapsedMs,
  };
}
