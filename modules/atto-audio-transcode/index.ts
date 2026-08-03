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

interface AttoAudioTranscodeNative {
  toTelephonyWav(inputPath: string, outputPath: string): Promise<TranscodeResult>;
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
