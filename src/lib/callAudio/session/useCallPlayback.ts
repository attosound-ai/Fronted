/**
 * useCallPlayback: what every audio surface uses to play through the engine
 * during a call. When `engineMode` is false the hook is inert and the surface
 * keeps its expo player exactly as before; when true the surface never starts
 * its expo player and drives the session instead.
 *
 * `ownerId` identifies the surface instance (a post id, a message id, the
 * project id...). Only the owner's transport reaches the engine; a claim by
 * another owner supersedes it and this hook reports `isOwner: false`.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useCallStore } from '@/stores/callStore';
import { getCallPlaybackController } from './controllerInstance';
import type {
  PlaybackResult,
  PlaybackSnapshot,
  PlaybackSource,
  PlaybackSurface,
} from './types';

export interface CallPlaybackHandle {
  /** True when this surface must use the engine (latched per call). */
  engineMode: boolean;
  isOwner: boolean;
  status: PlaybackSnapshot['status'];
  isPlaying: boolean;
  isPreparing: boolean;
  positionMs: number;
  durationMs: number;
  levelRms: number;
  transmit: boolean;
  /** Claims if needed, then plays. fromMs < 0 resumes. */
  play: (fromMs?: number) => Promise<PlaybackResult>;
  pause: () => Promise<PlaybackResult>;
  toggle: () => Promise<PlaybackResult>;
  seek: (ms: number) => Promise<PlaybackResult>;
  /** Claim without playing (prefetch + load), e.g. on becoming visible. */
  claim: () => Promise<PlaybackResult>;
  release: () => Promise<void>;
}

export interface UseCallPlaybackOptions {
  /** Which engine sub mode gates this surface. Default: the master mode. */
  requires?: 'engine' | 'timeline' | 'video';
  /** Release the session when the component unmounts (default true). */
  releaseOnUnmount?: boolean;
}

export function useCallPlayback(
  ownerId: string,
  surface: PlaybackSurface,
  source: PlaybackSource | null,
  options: UseCallPlaybackOptions = {}
): CallPlaybackHandle {
  const requires = options.requires ?? 'engine';
  const playback = useCallStore((s) => s.playback);
  const engineMode =
    requires === 'timeline'
      ? playback.engineTimeline
      : requires === 'video'
        ? playback.engineVideo
        : playback.engineMode;
  const isOwner =
    engineMode && playback.ownerId === ownerId && playback.status !== 'idle';

  const sourceRef = useRef(source);
  sourceRef.current = source;

  const claim = useCallback(async (): Promise<PlaybackResult> => {
    const src = sourceRef.current;
    if (!src) return { ok: false, reason: 'prepare_failed' };
    return getCallPlaybackController().claim(ownerId, surface, src);
  }, [ownerId, surface]);

  const play = useCallback(
    async (fromMs: number = -1): Promise<PlaybackResult> => {
      const controller = getCallPlaybackController();
      const snap = controller.getSnapshot();
      const owned =
        snap.ownerId === ownerId && snap.status !== 'idle' && snap.status !== 'error';
      if (!owned) {
        // Claim then play: play() during the prepare is queued by the controller.
        const claimed = claim();
        void controller.play(ownerId, fromMs);
        const result = await claimed;
        return result.ok ? { ok: true } : result;
      }
      return controller.play(ownerId, fromMs);
    },
    [ownerId, claim]
  );

  const pause = useCallback(() => getCallPlaybackController().pause(ownerId), [ownerId]);
  const seek = useCallback(
    (ms: number) => getCallPlaybackController().seek(ownerId, ms),
    [ownerId]
  );
  const release = useCallback(
    () => getCallPlaybackController().release(ownerId),
    [ownerId]
  );
  const toggle = useCallback(async (): Promise<PlaybackResult> => {
    const snap = getCallPlaybackController().getSnapshot();
    if (snap.ownerId === ownerId && snap.status === 'playing') return pause();
    return play();
  }, [ownerId, play, pause]);

  const releaseOnUnmount = options.releaseOnUnmount ?? true;
  useEffect(() => {
    if (!releaseOnUnmount) return undefined;
    return () => {
      void getCallPlaybackController().release(ownerId);
    };
  }, [ownerId, releaseOnUnmount]);

  return useMemo(
    () => ({
      engineMode,
      isOwner,
      status: isOwner ? playback.status : 'idle',
      isPlaying: isOwner && playback.status === 'playing',
      isPreparing: isOwner && playback.status === 'preparing',
      positionMs: isOwner ? playback.positionMs : 0,
      durationMs: isOwner ? playback.durationMs : 0,
      levelRms: isOwner ? playback.levelRms : 0,
      transmit: playback.transmit,
      play,
      pause,
      toggle,
      seek,
      claim,
      release,
    }),
    [engineMode, isOwner, playback, play, pause, toggle, seek, claim, release]
  );
}
