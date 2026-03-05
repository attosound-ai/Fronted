import { useEffect, useRef, useCallback } from 'react';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';
import { useCallStore } from '@/stores/callStore';
import type { LocalClip } from '../types';
import type { AudioSegment } from '@/types/call';
import { getTimelineDuration } from '../utils/clipOperations';

interface UseTimelinePlaybackProps {
  clips: LocalClip[];
  segments: (AudioSegment & { downloadUrl: string })[];
  playbackPositionMs: number;
  isPlaying: boolean;
  onPositionChange: (positionMs: number) => void;
  onPlayingChange: (playing: boolean) => void;
}

/**
 * Find the clip containing a position on a specific lane.
 */
function findClipOnLane(
  clips: LocalClip[],
  positionMs: number,
  laneIndex: number
): LocalClip | null {
  return (
    clips.find((c) => {
      if (c.laneIndex !== laneIndex) return false;
      const dur = c.endInSegment - c.startInSegment;
      return (
        positionMs >= c.positionInTimeline && positionMs < c.positionInTimeline + dur
      );
    }) ?? null
  );
}

/**
 * Wait for an AudioPlayer to finish loading its source.
 * Resolves `true` when loaded, `false` on timeout.
 */
function waitForLoaded(player: AudioPlayer, timeoutMs = 5000): Promise<boolean> {
  if (player.isLoaded) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      sub.remove();
      resolve(false);
    }, timeoutMs);
    const sub = player.addListener('playbackStatusUpdate', (status) => {
      if (status.isLoaded) {
        clearTimeout(timer);
        sub.remove();
        resolve(true);
      }
    });
  });
}

export function useTimelinePlayback({
  clips,
  segments,
  playbackPositionMs,
  isPlaying,
  onPositionChange,
  onPlayingChange,
}: UseTimelinePlaybackProps) {
  // Configure audio routing.
  // During a Twilio call, Twilio owns the AVAudioSession (.playAndRecord).
  // Calling setAudioModeAsync would reconfigure it and kill call audio.
  // expo-audio players can still play() under Twilio's session, so we
  // only configure when there is NO active call.
  const hasActiveCall = useCallStore((s) => s.activeCall !== null);
  useEffect(() => {
    if (hasActiveCall) return;
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldRouteThroughEarpiece: false,
    });
  }, [hasActiveCall]);

  const animFrameRef = useRef<number | null>(null);
  const playStartRef = useRef<number>(0);
  const playStartPosRef = useRef<number>(0);
  const playersRef = useRef<Map<number, AudioPlayer>>(new Map());
  const activeClipIdsRef = useRef<Map<number, string>>(new Map());

  // Keep fresh refs so the animation tick always sees latest values
  const clipsRef = useRef(clips);
  clipsRef.current = clips;
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;

  // Derive which lanes exist
  const laneIndices = useRef<number[]>([]);
  laneIndices.current = [...new Set(clips.map((c) => c.laneIndex))].sort();

  const getSegmentUrl = useCallback(
    (segmentId: string): string | null => {
      const seg = segmentsRef.current.find((s) => s.id === segmentId);
      return seg?.downloadUrl ?? null;
    },
    [] // uses ref, no dependency needed
  );

  // Get or create a player for a lane
  const getPlayer = useCallback((laneIndex: number): AudioPlayer => {
    let player = playersRef.current.get(laneIndex);
    if (!player) {
      player = createAudioPlayer(null);
      playersRef.current.set(laneIndex, player);
    }
    return player;
  }, []);

  // Update player source for a lane based on position.
  // Returns true if a new source was loaded (caller should waitForLoaded).
  const syncLanePlayer = useCallback(
    async (laneIndex: number, positionMs: number): Promise<boolean> => {
      const clip = findClipOnLane(clipsRef.current, positionMs, laneIndex);
      const player = getPlayer(laneIndex);
      const prevClipId = activeClipIdsRef.current.get(laneIndex);

      if (!clip) {
        if (prevClipId) {
          player.pause();
          activeClipIdsRef.current.delete(laneIndex);
        }
        return false;
      }

      const url = getSegmentUrl(clip.segmentId);
      if (!url) return false;

      let sourceChanged = false;

      // If clip changed, replace source
      if (clip.id !== prevClipId) {
        player.replace({ uri: url });
        activeClipIdsRef.current.set(laneIndex, clip.id);
        sourceChanged = true;
      }

      player.volume = clip.volume;

      const offsetInSegment = positionMs - clip.positionInTimeline + clip.startInSegment;
      await player.seekTo(offsetInSegment / 1000);

      return sourceChanged;
    },
    [getPlayer, getSegmentUrl]
  );

  // Pre-load players whenever position/clips/segments change while paused.
  // replace() on a paused player only swaps the AVPlayerItem without
  // activating the AVAudioSession, so it's safe during Twilio calls.
  useEffect(() => {
    if (isPlaying) return;
    for (const lane of laneIndices.current) {
      syncLanePlayer(lane, playbackPositionMs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackPositionMs, isPlaying, syncLanePlayer, clips, segments]);

  // Animate playhead AND sync audio at clip boundaries
  const startAnimation = useCallback(() => {
    playStartRef.current = Date.now();
    playStartPosRef.current = playbackPositionMs;

    const tick = () => {
      const elapsed = Date.now() - playStartRef.current;
      const newPos = playStartPosRef.current + elapsed;
      const currentClips = clipsRef.current;
      const totalDuration = getTimelineDuration(currentClips);

      if (newPos >= totalDuration) {
        onPositionChange(totalDuration);
        onPlayingChange(false);
        return;
      }

      onPositionChange(newPos);

      // Sync audio at clip boundaries: detect if the active clip changed on any lane
      for (const lane of laneIndices.current) {
        const currentClip = findClipOnLane(currentClips, newPos, lane);
        const prevClipId = activeClipIdsRef.current.get(lane) ?? null;
        const currentClipId = currentClip?.id ?? null;

        if (currentClipId !== prevClipId) {
          // Clip boundary crossed — sync the player, wait for load, then play
          const player = playersRef.current.get(lane);
          syncLanePlayer(lane, newPos).then(() => {
            if (player && currentClip) {
              waitForLoaded(player, 2000).then(() => player.play());
            }
          });
        }
      }

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
  }, [playbackPositionMs, onPositionChange, onPlayingChange, syncLanePlayer]);

  const stopAnimation = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  // Start/stop playback across all lanes
  useEffect(() => {
    if (isPlaying) {
      let cancelled = false;
      const lanes = [...laneIndices.current];

      (async () => {
        // 1. Sync all lane players (load sources + seek)
        await Promise.all(lanes.map((lane) => syncLanePlayer(lane, playbackPositionMs)));
        if (cancelled) return;

        // 2. Wait for all players to be loaded
        await Promise.all(
          lanes.map((lane) => {
            const player = playersRef.current.get(lane);
            const clipExists = findClipOnLane(clipsRef.current, playbackPositionMs, lane);
            if (player && clipExists) return waitForLoaded(player);
            return Promise.resolve(true);
          })
        );
        if (cancelled) return;

        // 3. Play all loaded players
        for (const lane of lanes) {
          const player = playersRef.current.get(lane);
          const clipExists = findClipOnLane(clipsRef.current, playbackPositionMs, lane);
          if (player && clipExists) {
            player.play();
          }
        }
        startAnimation();
      })();

      return () => {
        cancelled = true;
        stopAnimation();
      };
    } else {
      for (const [, player] of playersRef.current) {
        player.pause();
      }
      stopAnimation();
      return undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  // Cleanup players on unmount
  useEffect(() => {
    return () => {
      for (const [, player] of playersRef.current) {
        player.pause();
      }
      playersRef.current.clear();
      activeClipIdsRef.current.clear();
    };
  }, []);

  return { players: playersRef.current };
}
