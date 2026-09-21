import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { levelFromDb, waveformFromSamples, type OutgoingMedia } from './chatMedia';

/** Anything shorter is a slip of the finger, not a voice note (WhatsApp: 1 s). */
const MIN_DURATION_MS = 800;

/**
 * Press and hold voice notes on the composer's mic, the way WhatsApp and
 * Telegram record them. Meters the input while recording so the bubble can
 * draw a real waveform.
 */
export function useVoiceNote(conversationId: string) {
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const state = useAudioRecorderState(recorder, 100);
  const samples = useRef<number[]>([]);
  const startedAt = useRef(0);
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!state.isRecording) return;
    const value = levelFromDb((state as { metering?: number }).metering);
    samples.current.push(value);
    setLevel(value);
  }, [state.isRecording, state.durationMillis, state]);

  const start = useCallback(async (): Promise<boolean> => {
    const { granted } = await requestRecordingPermissionsAsync();
    analytics.capture(ANALYTICS_EVENTS.MESSAGES.VOICE_NOTE_STARTED, {
      conversation_id: conversationId,
      permission: granted,
    });
    if (!granted) return false;
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync({ isMeteringEnabled: true });
    samples.current = [];
    startedAt.current = Date.now();
    recorder.record();
    setRecording(true);
    return true;
  }, [conversationId, recorder]);

  const finish = useCallback(
    async (cancelled: boolean): Promise<OutgoingMedia | null> => {
      if (!recording) return null;
      setRecording(false);
      try {
        await recorder.stop();
      } catch {
        // Already stopped: nothing to send.
      }
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const durationMs = Math.max(state.durationMillis, Date.now() - startedAt.current);
      const tooShort = durationMs < MIN_DURATION_MS;
      if (cancelled || tooShort || !recorder.uri) {
        analytics.capture(ANALYTICS_EVENTS.MESSAGES.VOICE_NOTE_CANCELLED, {
          conversation_id: conversationId,
          duration_ms: durationMs,
          reason: cancelled ? 'slide' : tooShort ? 'too_short' : 'no_file',
        });
        return null;
      }
      return {
        kind: 'audio',
        uri: recorder.uri,
        mime: 'audio/m4a',
        fileName: `voice-${Date.now()}.m4a`,
        durationMs,
        waveform: waveformFromSamples(samples.current, 40),
      };
    },
    [conversationId, recorder, recording, state.durationMillis]
  );

  return {
    recording,
    durationMs: recording ? state.durationMillis : 0,
    level,
    start,
    stop: () => finish(false),
    cancel: () => finish(true),
  };
}
