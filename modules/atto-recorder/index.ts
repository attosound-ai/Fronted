import { Platform } from 'react-native';
import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core';

/**
 * Native studio take recorder (iOS only). Captures the microphone through a
 * low latency AVAudioEngine graph with live monitoring, input gain, a peak
 * limiter, a monitor only reverb, a backing track and overdub stems that play
 * from the timeline position, meters at 20 Hz and a listen back preview.
 *
 * Takes are written as CAF, Float32, mono, 48 kHz. Convert with
 * toCanonicalCaf (atto-audio-transcode) before placing them on a lane.
 *
 * During a phone call the Twilio audio device owns the audio session. Call
 * isSessionBusy() before opening the recording sheet; start() and arm() reject
 * with ERR_RECORDER_BUSY unless allowDuringCall is true.
 */

export type RecorderState =
  | 'idle'
  | 'ready'
  | 'recording'
  | 'paused'
  | 'stopped'
  | 'error';

export interface RecorderPort {
  id: string;
  name: string;
  /** AVAudioSession port type, for example MicrophoneBuiltIn or BluetoothHFP. */
  type: string;
  /** Only on inputs: true for the port the session will use. */
  selected?: boolean;
}

export type MonitorReverbPreset =
  | 'smallRoom'
  | 'mediumRoom'
  | 'largeRoom'
  | 'mediumHall'
  | 'largeHall'
  | 'plate'
  | 'cathedral'
  | 'mediumChamber'
  | 'largeChamber'
  | 'largeRoom2'
  | 'mediumHall2'
  | 'mediumHall3'
  | 'largeHall2';

export interface OverdubStem {
  /** Canonical CAF (or any AVFoundation readable file). File URL or bare path. */
  path: string;
  /** Timeline position of the stem's first frame, in ms. */
  startMs: number;
  /** Gain applied to the stem while it plays, in dB. */
  gainDb?: number;
}

export interface RecorderConfig {
  /** Hear the processed input while armed or recording. */
  monitoring?: boolean;
  /** Input gain before the limiter, in dB (clamped to plus or minus 24). */
  inputGainDb?: number;
  /** Apple peak limiter between the gain stage and the file writer. */
  limiter?: boolean;
  /** Reverb on the monitor path only; never written to the take. */
  monitorReverb?: boolean;
  monitorReverbPreset?: MonitorReverbPreset;
  /** Wet and dry balance of the monitor reverb, 0 to 100. */
  monitorReverbMix?: number;
  /** Backing track that plays from fromMs while recording. null clears it. */
  backingTrackPath?: string | null;
  /** 0 to 1. */
  backingTrackVolume?: number;
  /** When true the backing track is summed into the recorded file. */
  mixBackingIntoRecording?: boolean;
  /** Existing stems to play along while recording, each at its own offset. */
  overdubPaths?: OverdubStem[];
  format?: 'caf';
}

export interface RecorderSnapshot {
  state: RecorderState;
  /** Absent until a take has been started in this session. */
  path?: string;
  elapsedMs: number;
  monitoring: boolean;
  inputGainDb: number;
  limiter: boolean;
  monitorReverb: boolean;
  monitorReverbPreset: string;
  backingTrackVolume: number;
  mixBackingIntoRecording: boolean;
  engineRunning: boolean;
  hardwareSampleRate: number;
}

export interface SessionInfo {
  category: string;
  mode: string;
  otherAudioPlaying: boolean;
  sampleRate: number;
  ioBufferDurationMs: number;
  inputLatencyMs: number;
  outputLatencyMs: number;
  busy: boolean;
}

export interface StartOptions {
  /** Timeline position the take starts at; sources play from here. */
  fromMs?: number;
  /** Where to write the CAF. Defaults to a unique file under the temp directory. */
  outputPath?: string;
  /** Set true only when the caller has decided the recorder may take the session from a call. */
  allowDuringCall?: boolean;
}

export interface StartResult {
  /** Wall clock ms when the writer opened. */
  startedAt: number;
  path: string;
  fromMs: number;
  sampleRate: number;
}

export interface StopResult {
  path: string;
  durationMs: number;
  /** Highest absolute sample of the take in dBFS; the silence floor is minus 120. */
  peakDb: number;
  sampleRate: number;
  fromMs: number;
  frames: number;
}

export interface MetersEvent {
  inputPeakDb: number;
  inputRmsDb: number;
  outputPeakDb: number;
  outputRmsDb: number;
  /** Frames written so far, as ms; zero while only armed. */
  elapsedMs: number;
  state: RecorderState;
}

export interface StateEvent {
  state: RecorderState;
  /** route_change, interruption, interruption_ended, write_failed or an error message. */
  reason?: string;
  path?: string;
}

export interface PreviewEndedEvent {
  finished: boolean;
}

export const ERR_RECORDER_BUSY = 'ERR_RECORDER_BUSY';
export const ERR_RECORDER_STATE = 'ERR_RECORDER_STATE';
export const ERR_RECORDER_SESSION = 'ERR_RECORDER_SESSION';
export const ERR_RECORDER_ENGINE = 'ERR_RECORDER_ENGINE';
export const ERR_RECORDER_INPUT = 'ERR_RECORDER_INPUT';
export const ERR_RECORDER_FILE = 'ERR_RECORDER_FILE';

export class RecorderError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'RecorderError';
    this.code = code;
  }
}

interface AttoRecorderNative {
  isSessionBusy(): boolean;
  getSessionInfo(): SessionInfo;
  getState(): RecorderSnapshot;
  requestPermission(): Promise<boolean>;
  listInputs(): Promise<RecorderPort[]>;
  setInput(id: string): Promise<void>;
  listOutputs(): Promise<RecorderPort[]>;
  configure(options: RecorderConfig): Promise<RecorderSnapshot>;
  arm(options: { allowDuringCall?: boolean }): Promise<RecorderSnapshot>;
  disarm(): Promise<void>;
  start(options: StartOptions): Promise<StartResult>;
  pause(): Promise<RecorderSnapshot>;
  resume(): Promise<RecorderSnapshot>;
  stop(): Promise<StopResult>;
  discard(): Promise<void>;
  previewPlay(path: string): Promise<{ durationMs: number }>;
  previewStop(): Promise<void>;
  addListener(eventName: string, listener: (event: never) => void): EventSubscription;
}

// requireOptionalNativeModule: on Android or a binary that predates this
// module it resolves to null so importing never throws.
const native = requireOptionalNativeModule<AttoRecorderNative>('AttoRecorder');

export function isRecorderAvailable(): boolean {
  return Platform.OS === 'ios' && native != null;
}

function ensure(): AttoRecorderNative {
  if (!isRecorderAvailable()) {
    throw new RecorderError(
      ERR_RECORDER_ENGINE,
      'Native recorder is not available on this build'
    );
  }
  return native!;
}

async function call<T>(run: (module: AttoRecorderNative) => Promise<T>): Promise<T> {
  const module = ensure();
  try {
    return await run(module);
  } catch (error) {
    const raw = error as { code?: unknown; message?: unknown } | null;
    const code = typeof raw?.code === 'string' ? raw.code : ERR_RECORDER_ENGINE;
    const message =
      typeof raw?.message === 'string' ? raw.message : 'Recorder call failed';
    throw new RecorderError(code, message);
  }
}

/**
 * True when a call device (voice chat mode) or other audio owns the session.
 * Combine with useCallStore().activeCall on the JS side before opening the sheet.
 */
export function isSessionBusy(): boolean {
  if (!isRecorderAvailable()) return false;
  return native!.isSessionBusy();
}

export function getSessionInfo(): SessionInfo | null {
  if (!isRecorderAvailable()) return null;
  return native!.getSessionInfo();
}

export function getRecorderState(): RecorderSnapshot | null {
  if (!isRecorderAvailable()) return null;
  return native!.getState();
}

/** Prompts for the microphone when needed; resolves false when denied. */
export function requestRecorderPermission(): Promise<boolean> {
  return call((m) => m.requestPermission());
}

export function listInputs(): Promise<RecorderPort[]> {
  return call((m) => m.listInputs());
}

export function setInput(id: string): Promise<void> {
  return call((m) => m.setInput(id));
}

export function listOutputs(): Promise<RecorderPort[]> {
  return call((m) => m.listOutputs());
}

/**
 * Merge settings. Live parameters (monitoring, gain, limiter, reverb, backing
 * volume) apply immediately, even mid take. Sources (backing track, overdubs,
 * mixBackingIntoRecording) apply at the next start or while armed.
 */
export function configureRecorder(options: RecorderConfig): Promise<RecorderSnapshot> {
  return call((m) => m.configure(options));
}

/**
 * Take the session and run the engine without writing, so meters and
 * monitoring are live while the sheet is open. Rejects with
 * ERR_RECORDER_BUSY during a call unless allowDuringCall is true.
 */
export function armRecorder(
  options: { allowDuringCall?: boolean } = { allowDuringCall: false }
): Promise<RecorderSnapshot> {
  return call((m) => m.arm(options));
}

/** Stop the engine and give the session back. Not allowed mid take. */
export function disarmRecorder(): Promise<void> {
  return call((m) => m.disarm());
}

/**
 * Begin writing the take. Sources start at fromMs on one shared engine time
 * so the file lines up with the timeline. Arms first when needed.
 */
export function startRecording(options: StartOptions = {}): Promise<StartResult> {
  return call((m) => m.start({ allowDuringCall: false, fromMs: 0, ...options }));
}

export function pauseRecording(): Promise<RecorderSnapshot> {
  return call((m) => m.pause());
}

export function resumeRecording(): Promise<RecorderSnapshot> {
  return call((m) => m.resume());
}

/** Close the file, restore the audio session and report the take. */
export function stopRecording(): Promise<StopResult> {
  return call((m) => m.stop());
}

/** Delete the current take file (stops first when a take is in progress). */
export function discardRecording(): Promise<void> {
  return call((m) => m.discard());
}

/** Listen back. Emits AttoRecorderPreviewEnded when playback reaches the end. */
export function previewPlay(path: string): Promise<{ durationMs: number }> {
  return call((m) => m.previewPlay(path));
}

export function previewStop(): Promise<void> {
  return call((m) => m.previewStop());
}

const noopSubscription: EventSubscription = { remove() {} };

export function addMetersListener(
  listener: (event: MetersEvent) => void
): EventSubscription {
  if (!isRecorderAvailable()) return noopSubscription;
  return native!.addListener('AttoRecorderMeters', listener as (event: never) => void);
}

export function addStateListener(
  listener: (event: StateEvent) => void
): EventSubscription {
  if (!isRecorderAvailable()) return noopSubscription;
  return native!.addListener('AttoRecorderState', listener as (event: never) => void);
}

export function addPreviewEndedListener(
  listener: (event: PreviewEndedEvent) => void
): EventSubscription {
  if (!isRecorderAvailable()) return noopSubscription;
  return native!.addListener(
    'AttoRecorderPreviewEnded',
    listener as (event: never) => void
  );
}
