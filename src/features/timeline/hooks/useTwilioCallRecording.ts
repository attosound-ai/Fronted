import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';

import { showToast } from '@/components/ui/Toast';
import { useCallStore } from '@/stores/callStore';
import { telephonyService } from '@/lib/api/telephonyService';
import { projectService } from '@/lib/api/projectService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { emitTelemetryMarker } from '@/lib/telemetry/callTelemetry';
import type { LocalClip } from '../types';

/**
 * True for failures worth retrying: no HTTP response at all (axios "Network
 * Error"), a client-side timeout (ECONNABORTED), or a 5xx from the gateway.
 * A real 4xx (e.g. call already ended) is NOT transient and must not retry.
 */
function isTransientNetworkError(error: unknown): boolean {
  const e = error as {
    code?: string;
    message?: string;
    response?: { status?: number };
  } | null;
  if (e?.code === 'ECONNABORTED') return true;
  const status = e?.response?.status;
  if (status != null) return status >= 500;
  // No response object → the request never reached a server (network down/flaky).
  return /network|timeout/i.test(e?.message ?? '');
}

interface UseTwilioCallRecordingOptions {
  projectId: string;
  activeLaneIndex: number;
  /**
   * Where on the timeline this take belongs, in ms — read at STOP time but
   * snapshotted by the caller at record START (the playhead the user was
   * listening at). Without it the backend appends the clip after the last clip
   * on the lane, so a take sung over an imported track landed detached at the
   * end of the timeline (David, Aug 2: "la pista de grabación se pone al final
   * y uno confunde las cosas").
   */
  getRecordStartMs?: () => number;
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
  getRecordStartMs,
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
  const getRecordStartMsRef = useRef(getRecordStartMs);
  getRecordStartMsRef.current = getRecordStartMs;

  // Wall-clock the armed window so call_capture_stopped can report how long
  // capture ran vs. how much audio the backend actually produced.
  const recordingStartedAtRef = useRef<number | null>(null);

  // Synchronous re-entrancy latch. The isRecording/isUploading state flips only
  // AFTER the async startCapture resolves, so a rapid double-tap (or a re-render
  // firing onRecord) could launch several startCapture calls before the first
  // returned. On a flaky network that produced ~10 startCapture calls in 200ms,
  // each popping a "Recording failed" Alert that stacked and froze the UI
  // (David, Jul 20 telemetry: 10× 'Network Error' in one burst). A ref guards
  // synchronously where React state can't.
  const armingRef = useRef(false);

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
    if (isRecording || isUploading || armingRef.current) {
      // A concurrent/duplicate arm attempt — swallow it (and record that we did,
      // so the burst is visible in telemetry as blocked_reentry rather than a
      // pile of failed starts).
      if (armingRef.current) {
        analytics.capture(ANALYTICS_EVENTS.CALL.CAPTURE_STARTED, {
          call_sid: activeCall?.callSid ?? null,
          outcome: 'blocked_reentry',
        });
      }
      return;
    }
    if (!activeCall) {
      Alert.alert(
        t('toasts.recordingFailed', 'Recording failed'),
        t('toasts.noActiveCall', 'No active call to record from.')
      );
      return;
    }
    armingRef.current = true;
    const t0 = Date.now();
    const sinceConnectedMs = activeCall.connectedAt
      ? Date.now() - new Date(activeCall.connectedAt).getTime()
      : null;
    // startCapture only ARMS the Twilio Media Stream — it never touches the live
    // call's own audio path — so retrying a transient network/timeout failure is
    // safe. The Network-Error burst coincided with a 27MB upload saturating the
    // uplink; a couple of short-timeout retries ride over that blip instead of
    // failing the whole recording. Non-transient errors (real 4xx) don't retry.
    const MAX_ATTEMPTS = 3;
    const PER_ATTEMPT_TIMEOUT_MS = 8000;
    try {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const { streamSid } = await telephonyService.startCapture(
            activeCall.callSid,
            PER_ATTEMPT_TIMEOUT_MS
          );
          startCapture(streamSid);
          setIsRecording(true);
          // Memory attribution: recording arms a Twilio Media Stream capture +
          // local buffering; bracket it so a heartbeat spike is tied to it.
          void emitTelemetryMarker('capture_armed', {
            active_lane_index: activeLaneRef.current,
          });
          // Stays armed (armingRef true) through the whole record→upload cycle;
          // stopRecording clears it. This closes the state-lag window where
          // isRecording hasn't re-rendered yet but the arm already succeeded.
          recordingStartedAtRef.current = Date.now();
          // The client join key (call_sid + stream_sid) to every
          // backend_recording_* event; outcome distinguishes "never armed" from
          // "armed but one-sided"; attempts exposes retry recovery.
          analytics.capture(ANALYTICS_EVENTS.CALL.CAPTURE_STARTED, {
            call_sid: activeCall.callSid,
            stream_sid: streamSid,
            direction: activeCall.direction,
            call_state: activeCall.state,
            since_connected_ms: sinceConnectedMs,
            project_id: projectIdRef.current || null,
            active_lane_index: activeLaneRef.current,
            start_latency_ms: Date.now() - t0,
            attempts: attempt,
            outcome: 'armed',
          });
          return;
        } catch (error: unknown) {
          if (!isTransientNetworkError(error) || attempt === MAX_ATTEMPTS) {
            throw error;
          }
          // Back off briefly before retrying (0.6s, 1.2s).
          await new Promise((r) => setTimeout(r, attempt * 600));
        }
      }
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
        attempts: MAX_ATTEMPTS,
        outcome: 'failed',
        http_status: httpStatus,
        error_message: msg,
      });
      // Toast, not Alert: a modal Alert stacks on repeated failures and freezes
      // the screen behind a wall of dialogs.
      showToast(
        t('toasts.recordingFailed', 'Recording failed') + (msg ? `: ${msg}` : '')
      );
      // A real failure never armed — free the latch so the user can retry.
      armingRef.current = false;
    }
  }, [isRecording, isUploading, activeCall, startCapture, t]);

  const stopRecording = useCallback(async () => {
    if (!activeCall || !isRecording) return;

    // Flip the UI to the "uploading" state IMMEDIATELY, before the baseline
    // getSegments + stopCapture network round-trips below. Those can take a
    // second or two on a slow link, and doing them first made the Stop button
    // look frozen and the take appear to hang (David, Jul 20: "se demora mucho
    // en reaccionar"). The placeholder stays on screen (amber "Uploading…") the
    // whole time so the audio never visually disappears.
    setIsRecording(false);
    setIsUploading(true);

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
    recordingStartedAtRef.current = null;

    // Poll the backend until the new segment is processed and visible. The
    // backend transcodes after we stop the stream, so it isn't instant — but a
    // flat 2s-per-try (old behaviour) made the clip visibly VANISH for 2-4s
    // before reappearing, which read as "el audio desaparece" (David, Jul 20;
    // telemetry showed the segment usually lands on the very first poll). A
    // fast-first schedule shows a quickly-ready segment in ~0.5s while still
    // giving a slow backend ~20s total headroom.
    const pollDelaysMs = [500, 800, 1200, 1500, 2000, 2000, 2500, 3000, 3000, 3000];
    const maxRetries = pollDelaysMs.length;
    try {
      for (let i = 0; i < maxRetries; i++) {
        pollRetriesUsed = i + 1;
        await new Promise((r) => setTimeout(r, pollDelaysMs[i]));
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
                // Place the take at the playhead it was performed over, not
                // appended at the end of the lane.
                const desiredPosition = getRecordStartMsRef.current?.();
                analytics.capture(ANALYTICS_EVENTS.CALL.RECORDING_PLACED, {
                  segment_id: newSegment.id,
                  lane_index: activeLaneRef.current,
                  requested_position_ms:
                    typeof desiredPosition === 'number' ? desiredPosition : null,
                  segment_duration_ms: newSegment.durationMs ?? null,
                });
                await projectService.addSegment(
                  projectIdRef.current,
                  newSegment.id,
                  activeLaneRef.current,
                  desiredPosition
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
      // Record→upload cycle is fully done; release the arm latch so the next
      // recording can start.
      armingRef.current = false;
      void emitTelemetryMarker('capture_ended', { stop_outcome: stopOutcome });
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
