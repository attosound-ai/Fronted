import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

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

interface AttoAudioTranscodeNative {
  toTelephonyWav(inputPath: string, outputPath: string): Promise<TranscodeResult>;
  renderEffects?(
    inputPath: string,
    outputPath: string,
    chain: EffectChain
  ): Promise<EffectsRenderResult>;
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
