/**
 * The timeline's ENGINE playback branch (Sep 15 2026): during a call in engine
 * mode the editor does not create expo-audio lane players at all. Every lane is
 * rendered offline into a stem and the native call playback session plays the
 * stems aligned, through the call's own audio unit. The rep hears the mix with
 * echo cancellation, and the 📡 gate decides whether the far party hears it.
 *
 *   Lane fader / mute / solo  → a live stem gain write (never a re render).
 *   Clip moved / trimmed / added → only that lane's stem is re rendered and
 *                                   swapped in place, playback continues.
 *   Lane added or removed       → the stem set is re claimed at the current
 *                                   position (a short gap, once).
 *
 * The playhead runs on the engine's clock: native ticks at 4 Hz plus a rAF
 * interpolation anchored to the tick's arrival time and capped at 500 ms, so
 * an interruption freezes the playhead instead of letting it run ahead.
 *
 * Returns `active`; when false this hook is inert and useTimelinePlayback keeps
 * its expo path byte for byte.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import { useCallStore } from '@/stores/callStore';
import { useCallPlayback } from '@/lib/callAudio/session/useCallPlayback';
import { getCallPlaybackController } from '@/lib/callAudio/session/controllerInstance';
import {
  buildStemSpecs,
  liveStemGains,
  stemContentKey,
  stemSetKey,
} from '@/lib/callAudio/session/mixSpec';
import type { PlaybackSnapshot, PlaybackSource } from '@/lib/callAudio/session/types';
import type { LocalClip, LaneMeta } from '../types';
import type { AudioSegment } from '@/types/call';
import { getTimelineDuration } from '../utils/clipOperations';

const COMMIT_INTERVAL_MS = 200;
const STRUCTURE_DEBOUNCE_MS = 300;
const MAX_EXTRAPOLATION_MS = 500;

export interface UseTimelineEnginePlaybackProps {
  clips: LocalClip[];
  segments: (AudioSegment & { downloadUrl: string })[];
  playbackPositionMs: number;
  isPlaying: boolean;
  laneMeta: Record<number, LaneMeta>;
  onPositionChange: (positionMs: number) => void;
  onPlayingChange: (playing: boolean) => void;
  positionSv?: SharedValue<number>;
}

let ownerSeq = 0;

export function useTimelineEnginePlayback(props: UseTimelineEnginePlaybackProps): {
  active: boolean;
} {
  const active = useCallStore((s) => s.playback.engineTimeline);
  const ownerIdRef = useRef<string>('');
  if (!ownerIdRef.current) ownerIdRef.current = `timeline:${++ownerSeq}`;
  const ownerId = ownerIdRef.current;

  const totalMs = useMemo(() => getTimelineDuration(props.clips), [props.clips]);
  const segmentUris = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of props.segments) map[s.id] = s.downloadUrl;
    return map;
  }, [props.segments]);
  const built = useMemo(
    () =>
      buildStemSpecs({
        clips: props.clips,
        segmentUris,
        laneMeta: props.laneMeta,
        totalMs,
      }),
    [props.clips, segmentUris, props.laneMeta, totalMs]
  );
  const setKey = useMemo(() => stemSetKey(built.stems), [built.stems]);
  const source: PlaybackSource | null = useMemo(
    () =>
      active && built.stems.length > 0
        ? { type: 'stems', kind: 'timeline', stems: built.stems, key: setKey }
        : null,
    [active, built.stems, setKey]
  );
  const engine = useCallPlayback(ownerId, 'timeline', source, { requires: 'timeline' });

  // Latest props for the rAF loop and the debounced structure handler.
  const propsRef = useRef(props);
  propsRef.current = props;
  const engineRef = useRef(engine);
  engineRef.current = engine;
  const snapRef = useRef<PlaybackSnapshot | null>(null);
  useEffect(() => {
    if (!active) return undefined;
    return getCallPlaybackController().subscribe((s) => {
      snapRef.current = s;
    });
  }, [active]);

  const isOwner = engine.isOwner;
  const status = engine.status;

  // ── Claim (structure) ────────────────────────────────────────────────
  // Keyed on the stem set identity (gain excluded): a fader move never lands
  // here, a clip edit re renders one stem, a lane count change re claims.
  const claimedKeyRef = useRef<string | null>(null);
  const claimedStemKeysRef = useRef<string[]>([]);
  useEffect(() => {
    if (!active || !source) return undefined;
    if (claimedKeyRef.current === setKey && isOwner) return undefined;
    const timer = setTimeout(
      () => {
        void (async () => {
          const controller = getCallPlaybackController();
          const snap = controller.getSnapshot();
          const owned =
            snap.ownerId === ownerId && snap.status !== 'idle' && snap.status !== 'error';
          const nextKeys = built.stems.map((s) => stemContentKey(s));
          const prevKeys = claimedStemKeysRef.current;
          const sameCount = owned && prevKeys.length === nextKeys.length;
          if (sameCount) {
            // Swap only the stems whose content changed; playback continues.
            for (let i = 0; i < nextKeys.length; i++) {
              if (nextKeys[i] !== prevKeys[i]) {
                await controller.replaceStem(ownerId, i, built.stems[i]);
              }
            }
          } else {
            const wasPlaying = owned && snap.status === 'playing';
            const resumeAt = wasPlaying
              ? (snapRef.current?.positionMs ?? propsRef.current.playbackPositionMs)
              : -1;
            const result = await controller.claim(ownerId, 'timeline', source);
            if (result.ok && wasPlaying) {
              await controller.play(ownerId, resumeAt);
            }
          }
          claimedKeyRef.current = setKey;
          claimedStemKeysRef.current = nextKeys;
        })();
      },
      claimedKeyRef.current === null ? 0 : STRUCTURE_DEBOUNCE_MS
    );
    return () => clearTimeout(timer);
    // built.stems is derived from setKey; source carries the same identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, setKey, isOwner, ownerId]);

  // ── Live gains (mute / solo / fader) ─────────────────────────────────
  const gains = useMemo(
    () => liveStemGains(built.stemLanes, props.laneMeta),
    [built.stemLanes, props.laneMeta]
  );
  const appliedGainsRef = useRef<number[]>([]);
  useEffect(() => {
    if (!active || !isOwner) return;
    const controller = getCallPlaybackController();
    gains.forEach((gain, i) => {
      if (appliedGainsRef.current[i] === gain) return;
      void controller.setStemGain(ownerId, i, gain);
    });
    appliedGainsRef.current = gains;
  }, [active, isOwner, gains, ownerId]);
  useEffect(() => {
    // Fresh claims start from the spec's gains; forget what was applied before.
    if (!isOwner) appliedGainsRef.current = [];
  }, [isOwner]);

  // ── Transport: the editor's isPlaying drives the engine ──────────────
  const lastCommittedRef = useRef<number>(-1);
  useEffect(() => {
    if (!active || !source) return;
    const e = engineRef.current;
    if (props.isPlaying) {
      if (status === 'playing') return;
      void e.play(propsRef.current.playbackPositionMs);
    } else if (status === 'playing') {
      void e.pause();
    }
    // status is read to avoid re issuing play on our own ticks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, source, props.isPlaying, isOwner]);

  // A position change from OUTSIDE the play loop while playing is a seek.
  useEffect(() => {
    if (!active || !isOwner || status !== 'playing') return;
    if (Math.abs(props.playbackPositionMs - lastCommittedRef.current) <= 1) return;
    lastCommittedRef.current = props.playbackPositionMs;
    void engineRef.current.seek(props.playbackPositionMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, isOwner, props.playbackPositionMs]);

  // Keep the UI thread value in step while not playing (seek, skip, undo).
  useEffect(() => {
    if (!active) return;
    if (props.positionSv && !props.isPlaying)
      props.positionSv.value = props.playbackPositionMs;
  }, [active, props.positionSv, props.playbackPositionMs, props.isPlaying]);

  // ── Playhead: engine clock + rAF interpolation ───────────────────────
  const animRef = useRef<number | null>(null);
  const stop = useCallback(() => {
    if (animRef.current !== null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
  }, []);
  useEffect(() => {
    if (!active || !isOwner || status !== 'playing') {
      stop();
      return undefined;
    }
    let lastCommitAt = 0;
    const tick = () => {
      const snap = snapRef.current;
      const p = propsRef.current;
      if (snap && snap.ownerId === ownerId && snap.status === 'playing') {
        const elapsed = Math.min(
          MAX_EXTRAPOLATION_MS,
          Math.max(0, Date.now() - snap.tickAt)
        );
        let pos = snap.positionMs + elapsed;
        const total = getTimelineDuration(p.clips);
        if (total > 0 && pos > total) pos = total;
        if (p.positionSv) p.positionSv.value = pos;
        const now = Date.now();
        if (!p.positionSv || now - lastCommitAt >= COMMIT_INTERVAL_MS) {
          lastCommitAt = now;
          lastCommittedRef.current = pos;
          p.onPositionChange(pos);
        }
      }
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return stop;
  }, [active, isOwner, status, ownerId, stop]);

  // End of the stems: land on the total and flip the editor to paused.
  useEffect(() => {
    if (!active || !isOwner || status !== 'ended') return;
    const p = propsRef.current;
    const total = getTimelineDuration(p.clips);
    if (p.positionSv) p.positionSv.value = total;
    lastCommittedRef.current = total;
    p.onPositionChange(total);
    p.onPlayingChange(false);
  }, [active, isOwner, status]);

  return { active };
}
