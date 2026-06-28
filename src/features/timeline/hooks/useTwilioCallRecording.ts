import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';

import { showToast } from '@/components/ui/Toast';
import { useCallStore } from '@/stores/callStore';
import { telephonyService } from '@/lib/api/telephonyService';
import { projectService } from '@/lib/api/projectService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import type { LocalClip } from '../types';

interface UseTwilioCallRecordingOptions {
  projectId: string;
  activeLaneIndex: number;
  /** Kept for API symmetry with useRecordAudio — no longer invoked from
   *  this hook because the backend auto-creates the clip via addSegment,
   *  and the query invalidation below brings it back into state. */
  addClip: (clip: LocalClip) => void;
}

/**
 * Twilio Media Stream recording for the active call. Used as a drop-in
 * replacement for `useRecordAudio` inside the TimelineEditor when the
 * editor is rendered during an active call (so the toolbar's record
 * button captures BOTH sides of the call instead of only the local mic).
 *
 * The shape of the returned object intentionally mirrors `useRecordAudio`
 * so the caller can swap them at construction time without changing any
 * downstream code.
 */
export function useTwilioCallRecording({
  projectId,
  activeLaneIndex,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  addClip: _addClip,
}: UseTwilioCallRecordingOptions) {
  const { t } = useTranslation('common');
  const queryClient = useQueryClient();
  const activeCall = useCallStore((s) => s.activeCall);
  const startCapture = useCallStore((s) => s.startCapture);
  const stopCapture = useCallStore((s) => s.stopCapture);

  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  // Refs so async polling callbacks don't stale-close on these.
  const activeLaneRef = useRef(activeLaneIndex);
  activeLaneRef.current = activeLaneIndex;
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;

  // Wall-clock the armed window so call_capture_stopped can report how long
  // capture ran vs. how much audio the backend actually produced.
  const recordingStartedAtRef = useRef<number | null>(null);

  // Tick the elapsed counter at 100ms while recording so the toolbar
  // label and the live placeholder both update smoothly.
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
    if (isRecording || isUploading) return;
    if (!activeCall) {
      Alert.alert(
        t('toasts.recordingFailed', 'Recording failed'),
        t('toasts.noActiveCall', 'No active call to record from.')
      );
      return;
    }
    const t0 = Date.now();
    const sinceConnectedMs = activeCall.connectedAt
      ? Date.now() - new Date(activeCall.connectedAt).getTime()
      : null;
    try {
      const { streamSid } = await telephonyService.startCapture(activeCall.callSid);
      startCapture(streamSid);
      setIsRecording(true);
      recordingStartedAtRef.current = Date.now();
      // The dead CAPTURE_STARTED constant, finally wired. This is the client
      // join key (call_sid + stream_sid) to every backend_recording_* event,
      // and outcome distinguishes "never armed" from "armed but one-sided".
      analytics.capture(ANALYTICS_EVENTS.CALL.CAPTURE_STARTED, {
        call_sid: activeCall.callSid,
        stream_sid: streamSid,
        direction: activeCall.direction,
        call_state: activeCall.state,
        since_connected_ms: sinceConnectedMs,
        project_id: projectIdRef.current || null,
        active_lane_index: activeLaneRef.current,
        start_latency_ms: Date.now() - t0,
        outcome: 'armed',
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      const httpStatus =
        (error as { response?: { status?: number } })?.response?.status ?? null;
      analytics.capture(ANALYTICS_EVENTS.CALL.CAPTURE_STARTED, {
        call_sid: activeCall.callSid,
        direction: activeCall.direction,
        call_state: activeCall.state,
        since_connected_ms: sinceConnectedMs,
        project_id: projectIdRef.current || null,
        active_lane_index: activeLaneRef.current,
        start_latency_ms: Date.now() - t0,
        outcome: 'failed',
        http_status: httpStatus,
        error_message: msg,
      });
      Alert.alert(t('toasts.recordingFailed', 'Recording failed'), msg);
    }
  }, [isRecording, isUploading, activeCall, startCapture, t]);

  const stopRecording = useCallback(async () => {
    if (!activeCall || !isRecording) return;

    // Snapshot identity + armed window up front — activeCall mutates as the
    // call continues, and the funnel must bind to the SAME call_sid/stream_sid
    // the backend_recording_* events carry.
    const callSidSnapshot = activeCall.callSid;
    const streamSidSnapshot = activeCall.activeStreamSid;
    const armedDurationMs = recordingStartedAtRef.current
      ? Date.now() - recordingStartedAtRef.current
      : null;

    // Telemetry accumulators — emitted once in `finally` so every exit path
    // (found / not-found / poll-error) closes the funnel.
    let stopOutcome = 'not_found';
    let pollRetriesUsed = 0;
    let foundSegment: {
      id: string;
      durationMs: number;
      fileSizeBytes: number | null;
    } | null = null;

    // Snapshot the segment count BEFORE stopping the stream so we can
    // tell which segment is the new one once the backend finishes
    // processing the upload.
    let baselineCount = 0;
    try {
      const current = await telephonyService.getSegments(activeCall.callSid);
      baselineCount = current.length;
    } catch {
      // 0 is safe — any new segment will be picked up by the polling
      // loop below.
    }

    // Stop the Twilio Media Stream capture.
    if (activeCall.activeStreamSid) {
      try {
        await telephonyService.stopCapture(
          activeCall.callSid,
          activeCall.activeStreamSid
        );
      } catch {
        // Stream may have already ended; the segment is still
        // processing on the backend.
      }
    }
    stopCapture();
    setIsRecording(false);
    setIsUploading(true);
    recordingStartedAtRef.current = null;

    // Poll the backend until the new segment is processed and visible.
    // Backend transcoding takes a few seconds.
    const maxRetries = 10;
    const retryDelayMs = 2000;
    try {
      for (let i = 0; i < maxRetries; i++) {
        pollRetriesUsed = i + 1;
        await new Promise((r) => setTimeout(r, retryDelayMs));
        try {
          const allSegments = await telephonyService.getSegments(activeCall.callSid);
          if (allSegments.length > baselineCount) {
            const newSegment = allSegments[allSegments.length - 1];
            foundSegment = newSegment;
            stopOutcome = 'segment_found';

            // Link the new segment to the active project and tell the
            // backend to auto-create a single timeline clip on the
            // current active lane. The backend de-dupes: if a clip for
            // this segment already exists in the project, it won't
            // create another one.
            //
            // IMPORTANT: we used to ALSO append an optimistic clip
            // client-side here, which combined with the backend's
            // auto-create produced two clips per recording. With the
            // backend now handling the clip creation authoritatively,
            // we rely on the query invalidation + refetch to bring the
            // canonical clip into the editor's state.
            if (projectIdRef.current) {
              try {
                await projectService.addSegment(
                  projectIdRef.current,
                  newSegment.id,
                  activeLaneRef.current
                );
                queryClient.invalidateQueries({
                  queryKey: ['project', projectIdRef.current],
                });
                queryClient.invalidateQueries({ queryKey: ['projects'] });
              } catch (e: unknown) {
                const m = e instanceof Error ? e.message : String(e);
                showToast(
                  t('toasts.couldNotLink', 'Could not link recording: {{message}}', {
                    message: m,
                  })
                );
              }
            }
            showToast(t('toasts.recordingAdded', 'Recording added to timeline'));
            return;
          }
        } catch (error: unknown) {
          if (i === maxRetries - 1) {
            stopOutcome = 'poll_error';
            const msg = error instanceof Error ? error.message : String(error);
            Alert.alert(
              t('toasts.recordingFailed', 'Recording failed'),
              t('toasts.couldNotLoadRecording', 'Could not load recording: {{message}}', {
                message: msg,
              })
            );
            return;
          }
        }
      }

      // All retries exhausted without finding a new segment.
      stopOutcome = 'not_found';
      Alert.alert(
        t('toasts.recordingNotFound', 'Recording not found'),
        t(
          'toasts.recordingNotFoundMessage',
          'The recording is taking longer than expected to process. Try again in a few seconds.'
        )
      );
    } finally {
      setIsUploading(false);
      // Close the recording funnel. segment_found==false after retries is the
      // client signature of a backend finalize/upload failure; armed_duration
      // vs segment_duration exposes lost audio. Joins to
      // backend_recording_segment.one_sided by call_sid + stream_sid.
      analytics.capture(ANALYTICS_EVENTS.CALL.CAPTURE_STOPPED, {
        call_sid: callSidSnapshot,
        stream_sid: streamSidSnapshot,
        armed_duration_ms: armedDurationMs,
        stop_outcome: stopOutcome,
        poll_retries_used: pollRetriesUsed,
        segment_found: foundSegment != null,
        segment_id: foundSegment?.id ?? null,
        segment_duration_ms: foundSegment?.durationMs ?? null,
        segment_file_size_bytes: foundSegment?.fileSizeBytes ?? null,
        baseline_segment_count: baselineCount,
      });
    }
  }, [activeCall, isRecording, stopCapture, queryClient, t]);

  return {
    startRecording,
    stopRecording,
    isRecording,
    isUploading,
    elapsed,
    elapsedMs,
  };
}
