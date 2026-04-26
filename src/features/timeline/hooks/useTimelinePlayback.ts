import { useEffect, useRef, useCallback } from 'react';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';
import { useCallStore } from '@/stores/callStore';
import type { LocalClip, LaneMeta } from '../types';
import type { AudioSegment } from '@/types/call';
import { getTimelineDuration } from '../utils/clipOperations';
import { computeLaneEffectiveVolume, hasAnySoloedLane } from '../utils/laneMixer';

interface UseTimelinePlaybackProps {
  clips: LocalClip[];
  segments: (AudioSegment & { downloadUrl: string })[];
  playbackPositionMs: number;
  isPlaying: boolean;
  laneMeta: Record<number, LaneMeta>;
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

/**
 * Multi-lane audio playback for the timeline editor.
 *
 * Uses `expo-audio` (NOT `react-native-audio-api`) because the latter
 * registers global AVAudioSession observers at module-load time that
 * interfere with the Twilio Voice call audio path. expo-audio is
 * Twilio-safe — its `createAudioPlayer` doesn't touch the audio session
 * unless you explicitly call `setAudioModeAsync`, which we guard
 * against during active calls.
 *
 * Tradeoff: stereo pan is NOT applied to the audible output here. The
 * `pan` value in `LaneMeta` still gets persisted (it controls the UI
 * thumb position) but `expo-audio.AudioPlayer` doesn't expose a pan
 * property. We accept this regression in exchange for not breaking
 * call audio. A future migration to a Twilio-compatible audio engine
 * could restore audible pan.
 */
export function useTimelinePlayback({
  clips,
  segments,
  playbackPositionMs,
  isPlaying,
  laneMeta,
  onPositionChange,
  onPlayingChange,
}: UseTimelinePlaybackProps) {
  // Configure audio routing.
  // During a Twilio call, Twilio owns the AVAudioSession (.playAndRecord).
  // Calling setAudioModeAsync would reconfigure it and kill call audio,
  // so we only configure when there is NO active call. expo-audio
  // players created with `keepAudioSessionActive: true` (see getPlayer
  // below) coexist safely with Twilio's session, so the user can
  // listen to clips and feed posts while still on the call.
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
  const laneMetaRef = useRef(laneMeta);
  laneMetaRef.current = laneMeta;

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

  // Get or create a player for a lane.
  //
  // CRITICAL: `keepAudioSessionActive: true` prevents expo-audio from
  // calling `AVAudioSession.setActive(false, .notifyOthersOnDeactivation)`
  // when the player is paused or finishes playing. Without this, every
  // pause() during a Twilio call would tear down the call's audio
  // session and silence the conversation. With it set, timeline
  // playback (and any other expo-audio playback in the app) coexists
  // peacefully with the active call.
  const getPlayer = useCallback((laneIndex: number): AudioPlayer => {
    let player = playersRef.current.get(laneIndex);
    if (!player) {
      player = createAudioPlayer(null, { keepAudioSessionActive: true });
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

      // Apply the full mixer chain: clip volume × lane gain, muted by mute/solo rules
      const meta = laneMetaRef.current[laneIndex];
      player.volume = computeLaneEffectiveVolume({
        clipVolume: clip.volume,
        laneGainDb: meta?.gainDb ?? 0,
        laneMuted: meta?.muted ?? false,
        laneSolo: meta?.solo ?? false,
        anyLaneSoloed: hasAnySoloedLane(laneMetaRef.current),
      });
      // NOTE: pan is NOT applied here. expo-audio's AudioPlayer doesn't
      // expose a pan property. The pan UI/state is preserved for when
      // we can switch to a Twilio-safe audio engine that supports it.

      const offsetInSegment = positionMs - clip.positionInTimeline + clip.startInSegment;
      await player.seekTo(offsetInSegment / 1000);

      return sourceChanged;
    },
    [getPlayer, getSegmentUrl]
  );

  // Pre-load players whenever position/clips/segments change while paused.
  // Safe during a call because players use `keepAudioSessionActive: true`,
  // so replace()/seekTo()/pause() never deactivate the AVAudioSession.
  useEffect(() => {
    if (isPlaying) return;
    for (const lane of laneIndices.current) {
      syncLanePlayer(lane, playbackPositionMs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackPositionMs, isPlaying, syncLanePlayer, clips, segments]);

  // Apply mixer changes (mute/solo/gain) immediately without waiting
  // for the next animation frame or user interaction.
  useEffect(() => {
    const anySoloed = hasAnySoloedLane(laneMeta);
    for (const lane of laneIndices.current) {
      const player = playersRef.current.get(lane);
      if (!player) continue;
      const activeClipId = activeClipIdsRef.current.get(lane);
      const clip = activeClipId
        ? clipsRef.current.find((c) => c.id === activeClipId)
        : null;
      const meta = laneMeta[lane];
      player.volume = computeLaneEffectiveVolume({
        clipVolume: clip?.volume ?? 1,
        laneGainDb: meta?.gainDb ?? 0,
        laneMuted: meta?.muted ?? false,
        laneSolo: meta?.solo ?? false,
        anyLaneSoloed: anySoloed,
      });
    }
  }, [laneMeta]);

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

      // Start playhead animation immediately — don't block on audio loading
      startAnimation();

      // Load and play audio in the background (best-effort)
      (async () => {
        try {
          // 1. Sync all lane players (load sources + seek)
          await Promise.all(
            lanes.map((lane) => syncLanePlayer(lane, playbackPositionMs))
          );
          if (cancelled) return;

          // 2. Wait for all players to be loaded (with timeout fallback)
          await Promise.all(
            lanes.map((lane) => {
              const player = playersRef.current.get(lane);
              const clipExists = findClipOnLane(
                clipsRef.current,
                playbackPositionMs,
                lane
              );
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
        } catch {
          // Audio playback is best-effort; animation continues regardless
        }
      })();

      return () => {
        cancelled = true;
        stopAnimation();
      };
    } else {
      // pause() is safe even during a Twilio call because the players
      // were created with `keepAudioSessionActive: true`, so pause does
      // NOT trigger expo-audio's deactivateSession.
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
