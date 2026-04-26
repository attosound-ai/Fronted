import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';

import { showToast } from '@/components/ui/Toast';
import { useCallStore } from '@/stores/callStore';
import { telephonyService } from '@/lib/api/telephonyService';
import { projectService } from '@/lib/api/projectService';
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
        t('toasts.noActiveCall', 'No active call to record from.'),
      );
      return;
    }
    try {
      const { streamSid } = await telephonyService.startCapture(activeCall.callSid);
      startCapture(streamSid);
      setIsRecording(true);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      Alert.alert(t('toasts.recordingFailed', 'Recording failed'), msg);
    }
  }, [isRecording, isUploading, activeCall, startCapture, t]);

  const stopRecording = useCallback(async () => {
    if (!activeCall || !isRecording) return;

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
          activeCall.activeStreamSid,
        );
      } catch {
        // Stream may have already ended; the segment is still
        // processing on the backend.
      }
    }
    stopCapture();
    setIsRecording(false);
    setIsUploading(true);

    // Poll the backend until the new segment is processed and visible.
    // Backend transcoding takes a few seconds.
    const maxRetries = 10;
    const retryDelayMs = 2000;
    try {
      for (let i = 0; i < maxRetries; i++) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
        try {
          const allSegments = await telephonyService.getSegments(activeCall.callSid);
          if (allSegments.length > baselineCount) {
            const newSegment = allSegments[allSegments.length - 1];

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
                  activeLaneRef.current,
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
                  }),
                );
              }
            }
            showToast(t('toasts.recordingAdded', 'Recording added to timeline'));
            return;
          }
        } catch (error: unknown) {
          if (i === maxRetries - 1) {
            const msg = error instanceof Error ? error.message : String(error);
            Alert.alert(
              t('toasts.recordingFailed', 'Recording failed'),
              t('toasts.couldNotLoadRecording', 'Could not load recording: {{message}}', {
                message: msg,
              }),
            );
            return;
          }
        }
      }

      // All retries exhausted without finding a new segment.
      Alert.alert(
        t('toasts.recordingNotFound', 'Recording not found'),
        t(
          'toasts.recordingNotFoundMessage',
          'The recording is taking longer than expected to process. Try again in a few seconds.',
        ),
      );
    } finally {
      setIsUploading(false);
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
