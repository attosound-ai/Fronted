/**
 * Turns a PlaybackSource into engine ready stem files: download (bounded),
 * canonicalise to CAF int16 mono 48 kHz, and for stem sources render every
 * lane offline. Everything is cached under `<cache>/callplay/` keyed by content
 * hashes, so a second claim of the same post, or a fader move on the same
 * timeline, never re downloads or re renders.
 *
 * Nothing here touches the audio session or the engine; it is pure file work
 * on the transcode module's background queue, cancellable through the token.
 */

import * as FileSystem from 'expo-file-system/legacy';
import {
  renderStem,
  toCanonicalCaf,
  cancelRender,
  sweepCache,
  isCanonicalCafAvailable,
  isStemRenderAvailable,
  isStemRenderCancelled,
} from '../../../../modules/atto-audio-transcode';
import { withTimeout } from '@/lib/net/connectivity';
import { stableHash, stemContentKey } from './mixSpec';
import type {
  PlaybackPreparer,
  PlaybackSource,
  PreparedStems,
  PrepareToken,
  StemSource,
} from './types';

const CACHE_DIR = `${FileSystem.cacheDirectory ?? ''}callplay/`;
const DOWNLOAD_TIMEOUT_MS = 20_000;
const CACHE_CAP_BYTES = 300 * 1024 * 1024;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
const CANONICAL_RATE = 48000;

let lastSweepAt = 0;
let dirReady = false;

async function ensureDir(): Promise<void> {
  if (dirReady) return;
  try {
    const info = await FileSystem.getInfoAsync(CACHE_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
    }
    dirReady = true;
  } catch {
    // A failing mkdir surfaces on the first write; nothing to do here.
  }
}

async function fileBytes(path: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    return info.exists ? (info.size ?? 0) : 0;
  } catch {
    return 0;
  }
}

function isLocal(uri: string): boolean {
  return uri.startsWith('file://') || uri.startsWith('/');
}

function extensionOf(uri: string, isVideo: boolean | undefined): string {
  const m = /\.([a-z0-9]{2,4})(?:\?|$)/i.exec(uri);
  if (m) return m[1].toLowerCase();
  return isVideo ? 'mp4' : 'm4a';
}

class PrepareCancelled extends Error {
  constructor() {
    super('prepare cancelled');
    this.name = 'PrepareCancelled';
  }
}

function checkCancelled(token: PrepareToken): void {
  if (token.cancelled) throw new PrepareCancelled();
}

/** Remote → local file in the cache (or the local path itself). */
async function resolveLocal(
  uri: string,
  isVideo: boolean | undefined,
  token: PrepareToken
): Promise<{ path: string; downloadMs: number; cacheHit: boolean }> {
  if (isLocal(uri)) return { path: uri, downloadMs: 0, cacheHit: true };
  await ensureDir();
  const target = `${CACHE_DIR}src-${stableHash(uri)}.${extensionOf(uri, isVideo)}`;
  if ((await fileBytes(target)) > 0)
    return { path: target, downloadMs: 0, cacheHit: true };
  const t0 = Date.now();
  checkCancelled(token);
  const res = await withTimeout(
    FileSystem.downloadAsync(uri, target),
    DOWNLOAD_TIMEOUT_MS
  );
  checkCancelled(token);
  return { path: res.uri, downloadMs: Date.now() - t0, cacheHit: false };
}

/** Local file → canonical CAF in the cache. */
async function canonicalise(
  localPath: string,
  token: PrepareToken
): Promise<{
  path: string;
  frames: number;
  durationMs: number;
  encodeMs: number;
  cacheHit: boolean;
  bytes: number;
}> {
  await ensureDir();
  const target = `${CACHE_DIR}canon-${stableHash(localPath)}.caf`;
  const existing = await fileBytes(target);
  if (existing > 0) {
    // 2 bytes per frame (int16 mono); the CAF header is a rounding error here.
    const frames = Math.max(0, Math.floor(existing / 2));
    return {
      path: target,
      frames,
      durationMs: Math.round((frames / CANONICAL_RATE) * 1000),
      encodeMs: 0,
      cacheHit: true,
      bytes: existing,
    };
  }
  checkCancelled(token);
  const result = await toCanonicalCaf(localPath, target);
  checkCancelled(token);
  if (!result) throw new Error('canonicalise failed');
  return {
    path: result.outputPath,
    frames: result.frames,
    durationMs: result.durationMs,
    encodeMs: result.encodeMs,
    cacheHit: false,
    bytes: result.outputBytes,
  };
}

async function maybeSweep(): Promise<void> {
  const now = Date.now();
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;
  try {
    await sweepCache(CACHE_DIR, CACHE_CAP_BYTES);
  } catch {
    // Housekeeping only.
  }
}

export function isPreparerAvailable(): boolean {
  return isCanonicalCafAvailable() && isStemRenderAvailable();
}

/**
 * Render one stem: canonicalise every distinct clip source first, rewrite the
 * clip paths, then sum offline. The stem file is keyed by the content of the
 * spec AFTER path rewriting, so the same lane renders once per edit.
 */
async function renderOneStem(
  stem: StemSource,
  token: PrepareToken,
  canonicalByUri: Map<string, string>
): Promise<{
  path: string;
  renderMs: number;
  cacheHit: boolean;
  encodeMs: number;
  downloadMs: number;
  bytes: number;
}> {
  let encodeMs = 0;
  let downloadMs = 0;
  let bytes = 0;
  const clips = [];
  for (const clip of stem.clips) {
    let canon = canonicalByUri.get(clip.path);
    if (!canon) {
      const local = await resolveLocal(clip.path, false, token);
      const c = await canonicalise(local.path, token);
      downloadMs += local.downloadMs;
      encodeMs += c.encodeMs;
      bytes += c.cacheHit ? 0 : c.bytes;
      canon = c.path;
      canonicalByUri.set(clip.path, canon);
    }
    clips.push({ ...clip, path: canon });
  }
  const rewritten = { totalFrames: stem.totalFrames, clips };
  await ensureDir();
  const target = `${CACHE_DIR}stem-${stemContentKey(rewritten)}.caf`;
  if ((await fileBytes(target)) > 0) {
    return { path: target, renderMs: 0, cacheHit: true, encodeMs, downloadMs, bytes };
  }
  checkCancelled(token);
  const jobId = `${stemContentKey(rewritten)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  token.jobIds.push(jobId);
  const result = await renderStem(rewritten, target, jobId);
  checkCancelled(token);
  if (!result) throw new Error('stem render unavailable');
  return {
    path: result.outputPath,
    renderMs: result.renderMs,
    cacheHit: false,
    encodeMs,
    downloadMs,
    bytes: bytes + result.outputBytes,
  };
}

export const nativePreparer: PlaybackPreparer = {
  async prepare(source: PlaybackSource, token: PrepareToken): Promise<PreparedStems> {
    void maybeSweep();
    if (source.type === 'file') {
      const local = await resolveLocal(source.uri, source.isVideo, token);
      const canon = await canonicalise(local.path, token);
      return {
        stems: [{ path: canon.path, gain: 1 }],
        durationMs: canon.durationMs,
        cacheHit: local.cacheHit && canon.cacheHit,
        downloadMs: local.downloadMs,
        encodeMs: canon.encodeMs,
        renderMs: 0,
        bytes: canon.bytes,
      };
    }
    const canonicalByUri = new Map<string, string>();
    const stems: { path: string; gain: number }[] = [];
    let cacheHit = true;
    let downloadMs = 0;
    let encodeMs = 0;
    let renderMs = 0;
    let bytes = 0;
    let totalFrames = 0;
    for (const stem of source.stems) {
      const r = await renderOneStem(stem, token, canonicalByUri);
      stems.push({ path: r.path, gain: stem.gain });
      cacheHit = cacheHit && r.cacheHit;
      downloadMs += r.downloadMs;
      encodeMs += r.encodeMs;
      renderMs += r.renderMs;
      bytes += r.bytes;
      totalFrames = Math.max(totalFrames, stem.totalFrames);
    }
    return {
      stems,
      durationMs: Math.round((totalFrames / CANONICAL_RATE) * 1000),
      cacheHit,
      downloadMs,
      encodeMs,
      renderMs,
      bytes,
    };
  },

  async prepareStem(stem: StemSource, token: PrepareToken) {
    const r = await renderOneStem(stem, token, new Map());
    return { path: r.path, renderMs: r.renderMs, cacheHit: r.cacheHit };
  },

  cancel(token: PrepareToken): void {
    token.cancelled = true;
    for (const id of token.jobIds) {
      try {
        cancelRender(id);
      } catch {
        // best effort
      }
    }
  },
};

export function isPrepareCancellation(error: unknown): boolean {
  return error instanceof PrepareCancelled || isStemRenderCancelled(error);
}
