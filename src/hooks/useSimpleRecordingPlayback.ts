import { useState, useRef, useCallback, useEffect } from 'react';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { useCallStore } from '@/stores/callStore';
import { reclaimAudioSession } from '@/hooks/useTwilioVoice';
import type { AudioSegment } from '@/types/call';

/**
 * Simplified sequential playback for recorded segments.
 * Plays segments one after another without timeline seeking.
 */
export function useSimpleRecordingPlayback(
  segments: (AudioSegment & { downloadUrl?: string })[],
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

  const totalDuration = segments.reduce(
    (sum, s) => sum + (s.durationMs ?? 0),
    0,
  );

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
    }
    stoppedByUserRef.current = false;
    lastHandledFinishRef.current = false;
    if (!isPlaying) {
      setCurrentIndex(0);
      setIsPlaying(true);
      player.seekTo(0);
      player.play();
    }
  }, [segments.length, isPlaying, player]);

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
    currentTime: status.currentTime ?? 0,
    totalDuration,
    toggle,
    stop,
  };
}
