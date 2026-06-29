import { create } from 'zustand';

/**
 * mixerStore — the in-call recording MIXER state (its own store, single
 * responsibility). Drives a CLIENT-SIDE multitrack recording that coexists with
 * (never replaces) the Twilio server-side compliance recording. The per-channel
 * `record` toggles + `gain` sliders affect ONLY the recorded mix — the live call
 * is untouched (the remote always hears your mic + any injected track).
 *
 * Four channels feed the record mix:
 *   - mic       — your microphone
 *   - remote    — the other person on the call
 *   - app       — the injected track (post/reel/beat)
 *   - metronome — a generated click (recording aid), with on/off + BPM
 *
 * The native engine (AttoAudioEngineDevice) reads these to weight + gate each
 * channel into the recorded file. State here is the source of truth the UI binds
 * to; a thin service mirrors changes to native.
 */

export type MixerChannel = 'mic' | 'remote' | 'app' | 'metronome';

export const MIXER_CHANNELS: MixerChannel[] = ['mic', 'remote', 'app', 'metronome'];

export interface ChannelState {
  /** Gain applied to this channel in the recorded mix, 0..1. */
  gain: number;
  /** Whether this channel is included in the recorded multitrack. */
  record: boolean;
}

interface MixerStoreState {
  channels: Record<MixerChannel, ChannelState>;
  /** Metronome click on/off (monitored so you can keep time; recorded per its channel). */
  metronomeEnabled: boolean;
  bpm: number;
  /** Whether the client-side multitrack record is currently capturing. */
  isMixRecording: boolean;
  /** Mixer sheet visibility — store-level so a single global host renders it. */
  mixerVisible: boolean;
}

interface MixerStoreActions {
  setChannelGain: (channel: MixerChannel, gain: number) => void;
  setChannelRecord: (channel: MixerChannel, record: boolean) => void;
  setMetronomeEnabled: (on: boolean) => void;
  setBpm: (bpm: number) => void;
  setMixRecording: (on: boolean) => void;
  showMixer: () => void;
  hideMixer: () => void;
  resetMixer: () => void;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const DEFAULT_CHANNELS: Record<MixerChannel, ChannelState> = {
  mic: { gain: 0.9, record: true },
  remote: { gain: 0.9, record: true },
  app: { gain: 0.8, record: true },
  // Metronome defaults to monitor-only (heard, not baked into the recording).
  metronome: { gain: 0.6, record: false },
};

const DEFAULTS = {
  channels: DEFAULT_CHANNELS,
  metronomeEnabled: false,
  bpm: 90,
  isMixRecording: false,
  mixerVisible: false,
};

export const useMixerStore = create<MixerStoreState & MixerStoreActions>((set) => ({
  ...DEFAULTS,

  setChannelGain: (channel, gain) =>
    set((s) => ({
      channels: {
        ...s.channels,
        [channel]: { ...s.channels[channel], gain: clamp01(gain) },
      },
    })),

  setChannelRecord: (channel, record) =>
    set((s) => ({
      channels: { ...s.channels, [channel]: { ...s.channels[channel], record } },
    })),

  setMetronomeEnabled: (on) => set({ metronomeEnabled: on }),

  setBpm: (bpm) => set({ bpm: Math.max(40, Math.min(240, Math.round(bpm))) }),

  setMixRecording: (on) => set({ isMixRecording: on }),

  showMixer: () => set({ mixerVisible: true }),
  hideMixer: () => set({ mixerVisible: false }),

  resetMixer: () => set({ ...DEFAULTS }),
}));
