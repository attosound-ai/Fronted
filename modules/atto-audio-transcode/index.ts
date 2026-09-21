import { Platform } from 'react-native';
import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core';

export interface TranscodeResult {
  outputPath: string;
  inputBytes: number;
  outputBytes: number;
  durationMs: number;
  sampleRate: number;
  channels: number;
  encodeMs: number;
}

/**
 * Non-destructive effect chain for one clip. Every block is optional; an absent
 * block means "not applied". Stored on the clip as data (never baked into the
 * source), rendered on-device by the native module, and serialisable for the
 * backend. Keep this the SINGLE definition of effect params.
 */
export interface EffectChain {
  eq?: {
    /** High-pass cutoff in Hz (0 = off). Kills rumble / handling noise. */
    highPassHz?: number;
    /** Presence boost/cut in dB around presenceHz (default 3 kHz). */
    presenceDb?: number;
    presenceHz?: number;
    lowShelfDb?: number;
  };
  compressor?: {
    thresholdDb?: number;
    /** Apple Dynamics Processor head room in dB: smaller = harder compression. */
    headRoomDb?: number;
    attackMs?: number;
    releaseMs?: number;
    makeupDb?: number;
  };
  reverb?: {
    preset?:
      | 'smallRoom'
      | 'mediumRoom'
      | 'largeRoom'
      | 'mediumHall'
      | 'largeHall'
      | 'plate'
      | 'cathedral';
    /** 0..100 */
    wetDryMix?: number;
  };
  delay?: {
    timeMs?: number;
    /** -100..100 */
    feedback?: number;
    /** 0..100 */
    wetDryMix?: number;
    lowPassCutoffHz?: number;
  };
  /** Offline only (never in the live call graph). */
  pitchTime?: {
    pitchCents?: number;
    /** Playback rate: 0.25..4 (1 = unchanged). Changes the clip's duration. */
    rate?: number;
  };
}

export interface EffectsRenderResult {
  outputPath: string;
  outputBytes: number;
  durationMs: number;
  sampleRate: number;
  channels: number;
  applied: string[];
  renderMs: number;
}

/**
 * Sample rate of every canonical clip and stem. Frame counts in StemSpec and
 * the results below are all expressed at this rate.
 */
export const CANONICAL_SAMPLE_RATE = 48000;

export interface CanonicalResult {
  outputPath: string;
  /** Total frames written, at CANONICAL_SAMPLE_RATE. */
  frames: number;
  durationMs: number;
  inputBytes: number;
  outputBytes: number;
  encodeMs: number;
}

export interface StemClipSpec {
  /** Canonical CAF produced by toCanonicalCaf. File URL or bare path. */
  path: string;
  /** Offset inside the clip file where reading starts (frames). */
  startFrame: number;
  /** Frames taken from the clip file. */
  frameCount: number;
  /** Stem frame where the clip's first frame lands. */
  positionFrame: number;
  /** Linear gain, 0..4 (1 = unchanged). Clamped natively. */
  gain: number;
}

export interface StemSpec {
  /** Exact length of the stem in frames: 1 up to 30 minutes at 48 kHz. */
  totalFrames: number;
  clips: StemClipSpec[];
}

export interface StemRenderResult {
  outputPath: string;
  totalFrames: number;
  durationMs: number;
  renderMs: number;
  /** Max absolute sample BEFORE clamping; above 1 means the stem clipped. */
  peak: number;
  /** Clips that actually contributed audio (empty or silent ones are skipped). */
  clips: number;
  outputBytes: number;
}

export interface SweepCacheResult {
  deleted: number;
  bytesFreed: number;
  bytesRemaining: number;
}

/** Native rejection codes surfaced by renderStem. */
export const ERR_RENDER_CANCELLED = 'ERR_RENDER_CANCELLED';
export const ERR_RENDER_SPEC = 'ERR_RENDER_SPEC';
export const ERR_RENDER_INPUT = 'ERR_RENDER_INPUT';

/**
 * Typed failure thrown by renderStem so callers can branch on `code`:
 * ERR_RENDER_CANCELLED (the caller asked for it), ERR_RENDER_SPEC (bad spec),
 * ERR_RENDER_INPUT (a clip file could not be opened or read, the message names
 * its path) or ERR_RENDER (anything else).
 */
export class StemRenderError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'StemRenderError';
    this.code = code;
  }
}

export function isStemRenderCancelled(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === ERR_RENDER_CANCELLED
  );
}

// ─── Range effects and edit operations (SoundLab parity) ────────────────────

export type FadeCurve = 'linear' | 'log';
export type NoiseKind = 'white' | 'pink' | 'brown';

/**
 * One editing or effect operation applied to a time range of a clip by
 * processRange / previewRange. `type` selects the op; every other field is
 * optional and falls back to the default written next to it (the native
 * parser clamps out of range values instead of rejecting them). Ops marked
 * "changes length" splice the clip; every other op keeps the clip length and
 * only rewrites the range.
 */
export type RangeOp =
  /** Replace the range with digital silence. */
  | { type: 'silence' }
  /** Cut the range out (changes length). */
  | { type: 'remove' }
  /** Keep only the range (changes length). */
  | { type: 'trim' }
  | { type: 'reverse' }
  /** Append `count` extra copies of the range after it (changes length). Default 1. */
  | { type: 'repeat'; count?: number }
  | { type: 'fadeIn'; curve?: FadeCurve }
  | { type: 'fadeOut'; curve?: FadeCurve }
  /** Gain in dB, default 0, clamped to minus 60 .. 40. */
  | { type: 'amplify'; gainDb?: number }
  /** Peak normalize the range to `peakDb` (default minus 1). */
  | { type: 'normalize'; peakDb?: number }
  /** Low shelf: `gainDb` (default 6) below `frequencyHz` (default 100). */
  | { type: 'bassBoost'; gainDb?: number; frequencyHz?: number }
  /** Ten parametric bands at 32, 64, 125, 250, 500, 1k, 2k, 4k, 8k, 16k Hz. Exactly ten values. */
  | { type: 'tenBandEq'; gainsDb: number[] }
  /** Defaults: threshold minus 20 dB, ratio 4, attack 10 ms, release 100 ms, makeup 0 dB. */
  | {
      type: 'compressor';
      thresholdDb?: number;
      ratio?: number;
      attackMs?: number;
      releaseMs?: number;
      makeupDb?: number;
    }
  /** Band limited compressor around `frequencyHz` (default 6000); threshold minus 30 dB, amount 12 dB. */
  | { type: 'deEss'; frequencyHz?: number; thresholdDb?: number; amountDb?: number }
  /** Explicit repeats: delay 300 ms, decay 0.5 (0..1), repeats 3. */
  | { type: 'echo'; delayMs?: number; decay?: number; repeats?: number }
  /** Feedback delay: delay 300 ms, feedback 30 (0..100), wetDry 30 (0..100), lowPass 5000 Hz. */
  | {
      type: 'tapeDelay';
      delayMs?: number;
      feedback?: number;
      wetDry?: number;
      lowPassHz?: number;
    }
  /** rate 0.4 Hz, depth 0.7 (0..1), feedback 0.3 (0..1), stages 4. */
  | {
      type: 'phaser';
      rateHz?: number;
      depth?: number;
      feedback?: number;
      stages?: number;
    }
  /** rate 1.5 Hz, depth 0.7 (0..1), resonance 2.5. */
  | { type: 'wahwah'; rateHz?: number; depth?: number; resonance?: number }
  /** Pitch shift in cents (minus 2400 .. 2400) at unchanged tempo. */
  | { type: 'changePitch'; cents?: number }
  /** Tempo multiplier 0.25 .. 4 at unchanged pitch (changes length). */
  | { type: 'changeTempo'; rate?: number }
  /** Extreme stretch: factor 2 .. 50 (default 8), window 0.25 s (changes length). */
  | { type: 'paulstretch'; factor?: number; windowSec?: number }
  /** Replace the range with a sine at `frequencyHz` (default 1000) at `gainDb` (default minus 12). */
  | { type: 'censorBleep'; frequencyHz?: number; gainDb?: number }
  /** Replace the range with noise at `amplitudeDb` (default minus 20). */
  | { type: 'noiseGenerator'; kind?: NoiseKind; amplitudeDb?: number }
  /** Drop silences under `thresholdDb` (minus 40) longer than `minSilenceMs` (300), keeping `keepMs` (50) per edge (changes length). */
  | {
      type: 'silenceRemover';
      thresholdDb?: number;
      minSilenceMs?: number;
      keepMs?: number;
    }
  /** Stereo input: keep the sides, drop the centre. Mono input: no op, the result carries noop: true. */
  | { type: 'centerCut' }
  /** Spectral gate; `strengthDb` (default 12) is the attenuation applied to noise. */
  | { type: 'denoise'; strengthDb?: number }
  /** Same presets as EffectChain.reverb; wetDryMix 0..100 (default 25). */
  | {
      type: 'reverb';
      preset?: NonNullable<EffectChain['reverb']>['preset'];
      wetDryMix?: number;
    }
  /** Same design as EffectChain.eq. */
  | {
      type: 'eqSimple';
      highPassHz?: number;
      presenceDb?: number;
      presenceHz?: number;
      lowShelfDb?: number;
    };

export type RangeOpType = RangeOp['type'];

/** Ops whose output length differs from the input length. */
export const LENGTH_CHANGING_RANGE_OPS: ReadonlySet<RangeOpType> = new Set<RangeOpType>([
  'remove',
  'trim',
  'repeat',
  'silenceRemover',
  'changeTempo',
  'paulstretch',
]);

export interface ProcessRangeResult {
  /** New canonical CAF (int16 mono 48 kHz) in the module's cache directory, as a file URL. */
  outputPath: string;
  durationSec: number;
  sampleRate: number;
  /** True when the op had nothing to do (centerCut on mono); outputPath is then the input. */
  noop: boolean;
  processMs: number;
}

export interface PreviewRangeResult {
  outputPath: string;
  durationSec: number;
  sampleRate: number;
}

export interface ProcessProgressEvent {
  jobId: string;
  /** 0..1 */
  progress: number;
}

/** Native rejection codes surfaced by processRange, previewRange and getPeaks. */
export const ERR_PROCESS_CANCELLED = 'ERR_PROCESS_CANCELLED';
export const ERR_PROCESS_OP = 'ERR_PROCESS_OP';
export const ERR_PROCESS_RANGE = 'ERR_PROCESS_RANGE';
export const ERR_PROCESS_INPUT = 'ERR_PROCESS_INPUT';

/**
 * Typed failure thrown by processRange and previewRange so callers can branch
 * on `code`: ERR_PROCESS_CANCELLED, ERR_PROCESS_OP (malformed op),
 * ERR_PROCESS_RANGE (bad start/end), ERR_PROCESS_INPUT (file could not be
 * opened or read) or ERR_PROCESS (anything else).
 */
export class RangeProcessError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'RangeProcessError';
    this.code = code;
  }
}

export function isRangeProcessCancelled(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === ERR_PROCESS_CANCELLED
  );
}

interface AttoAudioTranscodeNative {
  toTelephonyWav(inputPath: string, outputPath: string): Promise<TranscodeResult>;
  renderEffects?(
    inputPath: string,
    outputPath: string,
    chain: EffectChain
  ): Promise<EffectsRenderResult>;
  toCanonicalCaf?(inputPath: string, outputPath: string): Promise<CanonicalResult>;
  renderStem?(
    spec: StemSpec,
    outputPath: string,
    jobId: string
  ): Promise<StemRenderResult>;
  cancelRender?(jobId: string): void;
  sweepCache?(directoryPath: string, maxBytes: number): Promise<SweepCacheResult>;
  processRange?(
    inputPath: string,
    startSec: number,
    endSec: number | null,
    op: RangeOp,
    jobId: string | null
  ): Promise<ProcessRangeResult>;
  previewRange?(
    inputPath: string,
    startSec: number,
    endSec: number | null,
    op: RangeOp,
    previewSec: number,
    jobId: string | null
  ): Promise<PreviewRangeResult>;
  getPeaks?(inputPath: string, count: number, jobId: string | null): Promise<number[]>;
  cancelProcess?(jobId: string): void;
  speechVoices?(): SpeechVoice[];
  renderSpeech?(
    text: string,
    outputPath: string,
    voiceId: string | null,
    language: string | null,
    rate: number | null,
    pitch: number | null
  ): Promise<SpeechResult>;
  musicLibraryStatus?(): string;
  requestMusicLibrary?(): Promise<boolean>;
  pickFromMusicLibrary?(outputPath: string): Promise<MusicLibraryPick | null>;
  addListener?(
    eventName: 'AttoAudioProcessProgress',
    listener: (event: ProcessProgressEvent) => void
  ): EventSubscription;
}

// requireOptionalNativeModule (not requireNativeModule): on a build that predates
// this module, or on Android, it resolves to null instead of throwing at import
// time. Transcoding is an optimisation — never a hard dependency of importing.
const native =
  requireOptionalNativeModule<AttoAudioTranscodeNative>('AttoAudioTranscode');

export function isTranscodeAvailable(): boolean {
  return Platform.OS === 'ios' && native != null;
}

/**
 * Convert an audio file to the pipeline's target format (8 kHz mono 16-bit PCM
 * WAV) on-device, so we upload ~11x fewer bytes AND the server can skip its own
 * ffmpeg pass because the file already matches what it probes for.
 *
 * Returns null when transcoding is unavailable or fails — callers MUST fall back
 * to uploading the original file, so the worst case is exactly today's behaviour.
 */
export async function toTelephonyWav(
  inputPath: string,
  outputPath: string
): Promise<TranscodeResult | null> {
  if (!isTranscodeAvailable()) return null;
  try {
    return await native!.toTelephonyWav(inputPath, outputPath);
  } catch {
    return null;
  }
}

/** True when this binary carries the offline effects renderer (b167+). */
export function isEffectsRenderAvailable(): boolean {
  return Platform.OS === 'ios' && typeof native?.renderEffects === 'function';
}

/** True when the chain has at least one block to apply. */
export function isEffectChainEmpty(chain: EffectChain | null | undefined): boolean {
  if (!chain) return true;
  return (
    !chain.eq && !chain.compressor && !chain.reverb && !chain.delay && !chain.pitchTime
  );
}

/**
 * Render `chain` onto a clip's audio, on-device and offline (faster than
 * realtime, never touches the call's audio session). Returns null when the
 * renderer is unavailable, the chain is empty, or the render fails; callers
 * MUST keep using the dry source in that case, so the worst case is no effect.
 */
export async function renderEffects(
  inputPath: string,
  outputPath: string,
  chain: EffectChain
): Promise<EffectsRenderResult | null> {
  if (!isEffectsRenderAvailable() || isEffectChainEmpty(chain)) return null;
  try {
    return await native!.renderEffects!(inputPath, outputPath, chain);
  } catch {
    return null;
  }
}

/** True when this binary carries the canonical CAF converter. */
export function isCanonicalCafAvailable(): boolean {
  return Platform.OS === 'ios' && typeof native?.toCanonicalCaf === 'function';
}

/**
 * Convert ANY audio or video file to the studio's canonical clip format (CAF,
 * 16 bit PCM, mono, 48 kHz) on device. The output is written to a temp sibling
 * and renamed into place, so a file at `outputPath` is always complete.
 *
 * Returns null when the converter is unavailable or the conversion fails (for
 * example a video with no audio track); callers decide how to surface that.
 */
export async function toCanonicalCaf(
  inputPath: string,
  outputPath: string
): Promise<CanonicalResult | null> {
  if (!isCanonicalCafAvailable()) return null;
  try {
    return await native!.toCanonicalCaf!(inputPath, outputPath);
  } catch {
    return null;
  }
}

/** True when this binary carries the offline stem renderer. */
export function isStemRenderAvailable(): boolean {
  return Platform.OS === 'ios' && typeof native?.renderStem === 'function';
}

/**
 * Mix canonical clips into ONE stem file (CAF, 16 bit PCM, mono, 48 kHz,
 * exactly `spec.totalFrames` long) on device and offline. Constant memory,
 * never touches the call's audio session.
 *
 * Resolves null ONLY when the renderer is unavailable on this binary. Every
 * failure is rethrown as a StemRenderError so callers can tell a cancellation
 * (code ERR_RENDER_CANCELLED) from a real failure and keep the previous stem.
 *
 * `jobId` must be unique per call (a UUID): a cancel recorded for an id sticks
 * until the render with that id finishes, so reusing ids would cancel the
 * wrong job.
 */
export async function renderStem(
  spec: StemSpec,
  outputPath: string,
  jobId: string
): Promise<StemRenderResult | null> {
  if (!isStemRenderAvailable()) return null;
  try {
    return await native!.renderStem!(spec, outputPath, jobId);
  } catch (error) {
    const raw = error as { code?: unknown; message?: unknown } | null;
    const code = typeof raw?.code === 'string' ? raw.code : 'ERR_RENDER';
    const message = typeof raw?.message === 'string' ? raw.message : 'Stem render failed';
    throw new StemRenderError(code, message);
  }
}

/**
 * Ask a running renderStem job to stop. The native loop checks once per
 * block, so the promise rejects with ERR_RENDER_CANCELLED shortly after and
 * the partial output is deleted. No op on binaries without the renderer.
 */
export function cancelRender(jobId: string): void {
  if (Platform.OS !== 'ios' || typeof native?.cancelRender !== 'function') return;
  native.cancelRender(jobId);
}

/**
 * Delete the oldest files in `directoryPath` (by modification date) until its
 * total size is at or under `maxBytes`. Files modified in the last 60 s are
 * never touched so an in flight render or a fresh import survives. Returns
 * null when unavailable or when the sweep itself fails; eviction is best
 * effort and never blocks the studio.
 */
export async function sweepCache(
  directoryPath: string,
  maxBytes: number
): Promise<SweepCacheResult | null> {
  if (Platform.OS !== 'ios' || typeof native?.sweepCache !== 'function') return null;
  try {
    return await native.sweepCache(directoryPath, maxBytes);
  } catch {
    return null;
  }
}

// ─── Range processing ───────────────────────────────────────────────────────

export interface SpeechVoice {
  id: string;
  name: string;
  /** BCP 47 tag, for example es-MX. */
  language: string;
  /** default, enhanced or premium. Enhanced and premium need a download in iOS settings. */
  quality: string;
}

export interface SpeechResult {
  outputPath: string;
  durationSec: number;
  sampleRate: number;
}

export interface MusicLibraryPick {
  path: string;
  title: string;
  artist: string;
  durationSec: number;
}

/** Voices installed on this device, for the text to speech track source. */
export function speechVoices(): SpeechVoice[] {
  if (Platform.OS !== 'ios' || typeof native?.speechVoices !== 'function') return [];
  try {
    return native.speechVoices();
  } catch {
    return [];
  }
}

/**
 * Speaks `text` into a file without playing it out loud. `rate` follows
 * AVSpeechUtterance (0.1 to 1, natural is around 0.5) and `pitch` is 0.5 to 2.
 */
export async function renderSpeech(
  text: string,
  outputPath: string,
  options?: { voiceId?: string; language?: string; rate?: number; pitch?: number }
): Promise<SpeechResult | null> {
  if (Platform.OS !== 'ios' || typeof native?.renderSpeech !== 'function') return null;
  return await native.renderSpeech(
    text,
    outputPath,
    options?.voiceId ?? null,
    options?.language ?? null,
    options?.rate ?? null,
    options?.pitch ?? null
  );
}

/** granted, denied, restricted or undetermined. */
export function musicLibraryStatus(): string {
  if (Platform.OS !== 'ios' || typeof native?.musicLibraryStatus !== 'function') {
    return 'unavailable';
  }
  return native.musicLibraryStatus();
}

export async function requestMusicLibrary(): Promise<boolean> {
  if (Platform.OS !== 'ios' || typeof native?.requestMusicLibrary !== 'function')
    return false;
  return await native.requestMusicLibrary();
}

/**
 * Opens the system music picker and copies the chosen song to `outputPath` as
 * m4a. Resolves null when the person cancels; rejects when the song is
 * protected, which is every store or subscription download.
 */
export async function pickFromMusicLibrary(
  outputPath: string
): Promise<MusicLibraryPick | null> {
  if (Platform.OS !== 'ios' || typeof native?.pickFromMusicLibrary !== 'function')
    return null;
  return await native.pickFromMusicLibrary(outputPath);
}

/** True when this binary carries the range processor (processRange and friends). */
export function isRangeProcessAvailable(): boolean {
  return Platform.OS === 'ios' && typeof native?.processRange === 'function';
}

function toRangeProcessError(error: unknown, fallback: string): RangeProcessError {
  const raw = error as { code?: unknown; message?: unknown } | null;
  const code = typeof raw?.code === 'string' ? raw.code : 'ERR_PROCESS';
  const message = typeof raw?.message === 'string' ? raw.message : fallback;
  return new RangeProcessError(code, message);
}

/**
 * Apply `op` to [startSec, endSec) of the clip at `inputPath` (any format the
 * device can decode: canonical CAF, 8 kHz WAV, AAC m4a) and write a NEW
 * canonical CAF into the module's cache directory. `endSec` null means to the
 * end of the file. The input is never modified. Chunked, so memory does not
 * grow with the file; cancel with cancelProcess(jobId); follow progress with
 * addProcessProgressListener.
 *
 * Resolves null ONLY when the processor is unavailable on this binary. Every
 * failure is rethrown as a RangeProcessError so callers can tell a
 * cancellation (ERR_PROCESS_CANCELLED) from a real failure.
 *
 * `jobId` must be unique per call (a UUID): a cancel recorded for an id sticks
 * until the job with that id finishes.
 */
export async function processRange(
  inputPath: string,
  startSec: number,
  endSec: number | null,
  op: RangeOp,
  jobId?: string
): Promise<ProcessRangeResult | null> {
  if (!isRangeProcessAvailable()) return null;
  try {
    return await native!.processRange!(inputPath, startSec, endSec, op, jobId ?? null);
  } catch (error) {
    throw toRangeProcessError(error, 'Range processing failed');
  }
}

/**
 * Render a short audition of `op`: one second of untouched context before the
 * range, then the first `previewSec` seconds (default 5) of the processed
 * range, into a small canonical CAF. Never processes the whole file, so it is
 * quick enough to call on every slider change (debounce on the JS side).
 * remove previews the splice (one second each side); trim previews the head
 * of the range.
 */
export async function previewRange(
  inputPath: string,
  startSec: number,
  endSec: number | null,
  op: RangeOp,
  previewSec: number = 5,
  jobId?: string
): Promise<PreviewRangeResult | null> {
  if (Platform.OS !== 'ios' || typeof native?.previewRange !== 'function') return null;
  try {
    return await native.previewRange(
      inputPath,
      startSec,
      endSec,
      op,
      previewSec,
      jobId ?? null
    );
  } catch (error) {
    throw toRangeProcessError(error, 'Range preview failed');
  }
}

/**
 * Waveform overview: `count` buckets of the absolute peak (0..1) of the mono
 * mix, computed natively with vDSP and cached on disk next to the file (keyed
 * by name, modification time and count) so repeat calls cost one small read.
 * Returns null when unavailable or on failure; the waveform is decoration,
 * never a hard dependency.
 */
export async function getPeaks(
  inputPath: string,
  count: number,
  jobId?: string
): Promise<number[] | null> {
  if (Platform.OS !== 'ios' || typeof native?.getPeaks !== 'function') return null;
  try {
    return await native.getPeaks(inputPath, count, jobId ?? null);
  } catch {
    return null;
  }
}

/**
 * Ask a running processRange, previewRange or getPeaks job to stop. The
 * native loop checks between chunks, so the promise rejects with
 * ERR_PROCESS_CANCELLED shortly after and the partial output is deleted.
 * No op on binaries without the processor.
 */
export function cancelProcess(jobId: string): void {
  if (Platform.OS !== 'ios' || typeof native?.cancelProcess !== 'function') return;
  native.cancelProcess(jobId);
}

/**
 * Subscribe to progress of processRange and previewRange jobs that were given
 * a jobId: at most ten events per second per job, always ending at 1.
 * Returns null when unavailable; callers must handle the missing subscription.
 */
export function addProcessProgressListener(
  listener: (event: ProcessProgressEvent) => void
): EventSubscription | null {
  if (Platform.OS !== 'ios' || typeof native?.addListener !== 'function') return null;
  return native.addListener('AttoAudioProcessProgress', listener);
}
