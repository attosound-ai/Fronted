import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import {
  RecordingPresets,
  AudioModule,
  setAudioModeAsync,
  type AudioRecorder,
} from 'expo-audio';
import { useTranslation } from 'react-i18next';

import { showToast } from '@/components/ui/Toast';
import { projectService } from '@/lib/api/projectService';
import { serverClipToLocal } from '../types';
import type { LocalClip } from '../types';

interface UseRecordAudioOptions {
  projectId: string;
  activeLaneIndex: number;
  /** Called with the freshly-added clip so the reducer can append it. */
  addClip: (clip: LocalClip) => void;
}

/**
 * Local microphone recording → upload → new timeline clip.
 *
 * Used by `TimelineEditor` (post-call project view) so that users can
 * capture audio straight into the current project without switching to
 * the dedicated recording screen.
 *
 * IMPORTANT: this hook is **fully lazy**. It does NOT call
 * `useAudioRecorder` at instantiation time, because doing so allocates
 * a native `AVAudioRecorder` and registers it with expo-audio's
 * registry — and on iOS that interaction with the audio session has
 * been observed to disrupt an active Twilio call. Instead, the recorder
 * is allocated on demand inside `startRecording` via
 * `new AudioModule.AudioRecorder(options)` and held in a ref. When the
 * editor is mounted during a call (e.g. inside `ActiveCallScreen`) and
 * the user never taps the record button, the hook is effectively a
 * no-op and never touches the AVAudioSession.
 */
export function useRecordAudio({
  projectId,
  activeLaneIndex,
  addClip,
}: UseRecordAudioOptions) {
  const { t } = useTranslation('common');

  // The recorder is created lazily on first record. Keeping it in a ref
  // means: (a) no native allocation at hook mount time, and (b) the
  // same recorder instance is reused across consecutive recordings so
  // we don't leak.
  const recorderRef = useRef<AudioRecorder | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  // Keep active lane in a ref so async callbacks don't stale-close it.
  const activeLaneRef = useRef(activeLaneIndex);
  activeLaneRef.current = activeLaneIndex;

  // Tick the elapsed counter at 100ms while recording so the toolbar
  // label and the live placeholder both update smoothly. We use a
  // local timer instead of `useAudioRecorderState`'s polling because
  // the latter requires the hook-style recorder.
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

  /** Lazily allocate the native recorder on first call. */
  const ensureRecorder = useCallback((): AudioRecorder => {
    if (recorderRef.current) return recorderRef.current;
    // Replicate what `useAudioRecorder` does internally — flatten the
    // platform-specific preset into the shape that the native
    // constructor expects.
    const preset = RecordingPresets.HIGH_QUALITY;
    const platformOptions = {
      extension: preset.extension,
      sampleRate: preset.sampleRate,
      numberOfChannels: preset.numberOfChannels,
      bitRate: preset.bitRate,
      isMeteringEnabled: false,
      ...(Platform.OS === 'ios' ? preset.ios : preset.android),
    };
    // The TS types for `AudioModule.AudioRecorder` are a class
    // constructor exported from the native module. The
    // `useAudioRecorder` hook just wraps `new AudioModule.AudioRecorder(opts)`.
    const recorder = new (AudioModule.AudioRecorder as unknown as new (
      opts: typeof platformOptions
    ) => AudioRecorder)(platformOptions);
    recorderRef.current = recorder;
    return recorder;
  }, []);

  const startRecording = useCallback(async () => {
    if (isRecording || isUploading) return;
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          t('toasts.permissionDenied', 'Permission required'),
          t(
            'toasts.micPermission',
            'Microphone permission is required to record audio.'
          )
        );
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      const recorder = ensureRecorder();
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      Alert.alert(t('toasts.recordingFailed', 'Recording failed'), msg);
    }
  }, [isRecording, isUploading, ensureRecorder, t]);

  const stopRecording = useCallback(async () => {
    if (!isRecording) return;
    const recorder = recorderRef.current;
    if (!recorder) {
      setIsRecording(false);
      return;
    }
    try {
      await recorder.stop();
      setIsRecording(false);
      // Restore normal playback mode so other audio isn't blocked.
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });

      const uri = recorder.uri;
      if (!uri) {
        showToast(
          t('toasts.recordingFailed', 'Recording failed: no file produced')
        );
        return;
      }

      setIsUploading(true);

      // Derive a human-friendly filename. The recorder writes .m4a.
      const filename = `recording-${Date.now()}.m4a`;

      const serverClip = await projectService.uploadAudio(
        projectId,
        uri,
        filename,
        'audio/m4a',
        activeLaneRef.current
      );

      addClip(serverClipToLocal(serverClip));
      showToast(t('toasts.recordingAdded', 'Recording added to timeline'));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      showToast(
        t('toasts.recordingFailed', 'Recording failed: {{message}}', {
          message: msg,
        })
      );
    } finally {
      setIsUploading(false);
    }
  }, [isRecording, projectId, addClip, t]);

  return {
    startRecording,
    stopRecording,
    isRecording,
    isUploading,
    /** Whole-seconds elapsed counter, for formatting in toolbar labels. */
    elapsed,
    /** Live millisecond-precision elapsed time, for smooth animated UI. */
    elapsedMs,
  };
}
