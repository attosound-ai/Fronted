import { useState, useRef, useCallback, useEffect } from 'react';
import {
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioSampleListener,
  setAudioModeAsync,
} from 'expo-audio';
import { useCallStore } from '@/stores/callStore';
import { reclaimAudioSession } from '@/hooks/useTwilioVoice';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import type { AudioSegment } from '@/types/call';

/**
 * Simplified sequential playback for recorded segments.
 * Plays segments one after another without timeline seeking.
 */
export function useSimpleRecordingPlayback(
  segments: (AudioSegment & { downloadUrl?: string })[]
) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const stoppedByUserRef = useRef(false);
  const lastHandledFinishRef = useRef(false);

  // Only initialize the audio player when there are segments to play.
  // Initializing expo-audio while a Twilio VoIP call is active can
  // reconfigure the iOS audio session and interrupt call audio.
  const hasSegments = segments.length > 0;
  const currentUrl = hasSegments ? (segments[currentIndex]?.downloadUrl ?? null) : null;
  const player = useAudioPlayer(currentUrl, {
    updateInterval: 500,
    keepAudioSessionActive: true,
  });
  const status = useAudioPlayerStatus(player);

  // Real-time playback amplitude (B2): tap the decoded PCM and expose its RMS so
  // the visualizer follows the ACTUAL recording instead of a generic animation.
  // The sample callback fires per audio buffer (fast), so we stash RMS in a ref
  // and sample it into state on a 60ms interval — decoupling render rate from
  // the buffer rate keeps it cheap.
  const playbackAmpRef = useRef(0);
  const [amplitude, setAmplitude] = useState(0);

  useEffect(() => {
    try {
      player.setAudioSamplingEnabled(true);
    } catch {
      // sampling unsupported here — the wave just falls back to generic motion
    }
  }, [player]);

  useAudioSampleListener(player, (sample) => {
    const frames = sample.channels?.[0]?.frames;
    if (!frames || frames.length === 0) return;
    // Subsample (≤256 points) so RMS stays O(1)-ish regardless of buffer size.
    const step = Math.max(1, Math.floor(frames.length / 256));
    let sum = 0;
    let n = 0;
    for (let i = 0; i < frames.length; i += step) {
      const f = frames[i];
      sum += f * f;
      n++;
    }
    const rms = Math.sqrt(sum / Math.max(1, n));
    // perceptual curve + gain so quiet speech still reads on the wave
    playbackAmpRef.current = Math.max(0, Math.min(1, Math.sqrt(rms) * 1.5));
  });

  useEffect(() => {
    if (!isPlaying) {
      playbackAmpRef.current = 0;
      setAmplitude(0);
      return;
    }
    const id = setInterval(() => setAmplitude(playbackAmpRef.current), 60);
    return () => clearInterval(id);
  }, [isPlaying]);

  const totalDuration = segments.reduce((sum, s) => sum + (s.durationMs ?? 0), 0);

  // When a segment finishes, advance to the next or stop.
  // Use a ref guard because status.didJustFinish can stay true across renders.
  useEffect(() => {
    if (!status.didJustFinish) {
      lastHandledFinishRef.current = false;
      return;
    }
    if (lastHandledFinishRef.current || stoppedByUserRef.current) return;
    lastHandledFinishRef.current = true;

    if (currentIndex < segments.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      setIsPlaying(false);
      setCurrentIndex(0);
      reclaimCallAudio();
    }
  }, [status.didJustFinish, currentIndex, segments.length]);

  // Auto-play when index changes mid-playback
  useEffect(() => {
    if (isPlaying && currentUrl) {
      player.seekTo(0);
      player.play();
    }
  }, [currentIndex]);

  const play = useCallback(async () => {
    if (segments.length === 0) return;
    // During a call: set PlayAndRecord + mixWithOthers so audio
    // coexists with Twilio VoIP instead of overriding it.
    const call = useCallStore.getState().activeCall;
    if (call?.state === 'connected' || call?.state === 'reconnecting') {
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
        interruptionMode: 'mixWithOthers',
      });
    } else {
      // No active call: force a plain PLAYBACK session. Post-call the custom
      // engine can leave the session in a record/call config, which made the
      // recorded mix "finish" instantly (didJustFinish fired immediately).
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    }
    // Telemetry to diagnose the "play stops immediately" report: file_duration_ms
    // ≈ 0 ⇒ the recording file is empty (engine captured nothing); >0 but stops ⇒
    // a session/format issue.
    analytics.capture(ANALYTICS_EVENTS.CALL.AUDIO_MIX_PLAYBACK, {
      action: 'play',
      url_kind: currentUrl?.startsWith('file://') ? 'local_file' : 'remote',
      file_duration_ms: Math.round((status.duration ?? 0) * 1000),
      is_loaded: status.isLoaded ?? null,
      segment_count: segments.length,
    });
    stoppedByUserRef.current = false;
    lastHandledFinishRef.current = false;
    if (!isPlaying) {
      setCurrentIndex(0);
      setIsPlaying(true);
      player.seekTo(0);
      player.play();
    }
  }, [segments.length, isPlaying, player, currentUrl, status.duration, status.isLoaded]);

  const stop = useCallback(() => {
    stoppedByUserRef.current = true;
    player.pause();
    player.seekTo(0);
    setIsPlaying(false);
    setCurrentIndex(0);
    reclaimCallAudio();
  }, [player]);

  const toggle = useCallback(() => {
    if (isPlaying) {
      stop();
    } else {
      play();
    }
  }, [isPlaying, play, stop]);

  function reclaimCallAudio() {
    const call = useCallStore.getState().activeCall;
    if (call?.state === 'connected' || call?.state === 'reconnecting') {
      console.log('[RecordingPlayback] reclaiming audio session...');
      setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
        interruptionMode: 'mixWithOthers',
      }).then(() => reclaimAudioSession());
    } else {
      console.log('[RecordingPlayback] no active call, skipping reclaim');
    }
  }

  return {
    isPlaying,
    amplitude,
    currentTime: status.currentTime ?? 0,
    totalDuration,
    toggle,
    stop,
  };
}
