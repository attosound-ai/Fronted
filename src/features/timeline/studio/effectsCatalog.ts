/**
 * The range effects grid, in SoundLab's order, with the parameters each
 * dialog shows and the presets on its left column. Every entry builds the
 * native RangeOp from the current parameter values, so the sheet stays
 * data driven and the module remains the one place with DSP.
 */
export type EffectParamKind = 'slider' | 'choice';

export interface EffectParam {
  key: string;
  label: string;
  kind: EffectParamKind;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** For 'choice' params. */
  options?: { value: string; label: string }[];
  defaultValue: number | string;
}

export interface EffectPreset {
  name: string;
  values: Record<string, number | string>;
}

export type EffectValues = Record<string, number | string>;

export interface EffectDef {
  id: string;
  name: string;
  /** Effects handled elsewhere (AI tools) open their own flow. */
  kind: 'native' | 'ai' | 'edit';
  params: EffectParam[];
  presets: EffectPreset[];
  /** Native op for the values. `edit` and `ai` kinds return null. */
  buildOp: (v: EffectValues) => Record<string, unknown> | null;
  /** Pro badge like SoundLab shows on its AI tools. */
  pro?: boolean;
}

const slider = (
  key: string,
  label: string,
  min: number,
  max: number,
  defaultValue: number,
  step = 1,
  unit = ''
): EffectParam => ({ key, label, kind: 'slider', min, max, step, unit, defaultValue });

const num = (v: EffectValues, key: string, fallback: number): number => {
  const raw = v[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
};
const str = (v: EffectValues, key: string, fallback: string): string => {
  const raw = v[key];
  return typeof raw === 'string' ? raw : fallback;
};

export const EFFECTS: EffectDef[] = [
  {
    id: 'aiVocalSeparator',
    name: 'AI Vocal Separator',
    kind: 'ai',
    pro: true,
    params: [],
    presets: [],
    buildOp: () => null,
  },
  {
    id: 'aiStemSeparator',
    name: 'AI Stem Separator',
    kind: 'ai',
    pro: true,
    params: [],
    presets: [],
    buildOp: () => null,
  },
  {
    id: 'deEss',
    name: 'De essing',
    kind: 'native',
    params: [
      slider('frequencyHz', 'Frequency', 2000, 12000, 6000, 100, 'Hz'),
      slider('thresholdDb', 'Threshold', -60, 0, -30, 1, 'dB'),
      slider('amountDb', 'Amount', 0, 24, 8, 1, 'dB'),
    ],
    presets: [
      { name: 'Custom', values: {} },
      { name: 'Light', values: { frequencyHz: 6000, thresholdDb: -28, amountDb: 4 } },
      { name: 'Medium', values: { frequencyHz: 6500, thresholdDb: -32, amountDb: 8 } },
      { name: 'Strong', values: { frequencyHz: 7000, thresholdDb: -36, amountDb: 14 } },
    ],
    buildOp: (v) => ({
      type: 'deEss',
      frequencyHz: num(v, 'frequencyHz', 6000),
      thresholdDb: num(v, 'thresholdDb', -30),
      amountDb: num(v, 'amountDb', 8),
    }),
  },
  {
    // Runs on the device: spectral gate that learns the noise floor from the
    // quietest frames of the range and subtracts it. The model based back end
    // swaps in behind the same op.
    id: 'aiNoiseSuppression',
    name: 'AI Noise Suppression',
    kind: 'native',
    params: [slider('strengthDb', 'Strength', 4, 30, 18, 1, 'dB')],
    presets: [
      { name: 'Custom', values: {} },
      { name: 'Room tone', values: { strengthDb: 10 } },
      { name: 'Line noise', values: { strengthDb: 18 } },
      { name: 'Heavy', values: { strengthDb: 26 } },
    ],
    buildOp: (v) => ({ type: 'denoise', strengthDb: num(v, 'strengthDb', 18) }),
  },
  {
    id: 'tenBandEq',
    name: '10 Bands Equalizer',
    kind: 'native',
    params: [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000].map((hz, i) =>
      slider(`b${i}`, hz >= 1000 ? `${hz / 1000} kHz` : `${hz} Hz`, -12, 12, 0, 0.5, 'dB')
    ),
    presets: [
      { name: 'Custom', values: {} },
      {
        name: 'Flat',
        values: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`b${i}`, 0])),
      },
      {
        name: 'Bass Boost',
        values: { b0: 6, b1: 5, b2: 4, b3: 2, b4: 0, b5: 0, b6: 0, b7: 0, b8: 0, b9: 0 },
      },
      {
        name: 'Treble Boost',
        values: { b0: 0, b1: 0, b2: 0, b3: 0, b4: 0, b5: 1, b6: 2, b7: 4, b8: 5, b9: 6 },
      },
      {
        name: 'Vocal',
        values: {
          b0: -2,
          b1: -2,
          b2: -1,
          b3: 0,
          b4: 2,
          b5: 3,
          b6: 3,
          b7: 2,
          b8: 1,
          b9: 0,
        },
      },
      {
        name: 'Rock',
        values: {
          b0: 4,
          b1: 3,
          b2: 1,
          b3: -1,
          b4: -2,
          b5: -1,
          b6: 1,
          b7: 3,
          b8: 4,
          b9: 4,
        },
      },
      {
        name: 'Pop',
        values: {
          b0: -1,
          b1: 1,
          b2: 3,
          b3: 4,
          b4: 3,
          b5: 1,
          b6: 0,
          b7: -1,
          b8: -1,
          b9: -1,
        },
      },
      {
        name: 'Loudness',
        values: {
          b0: 6,
          b1: 4,
          b2: 0,
          b3: 0,
          b4: -2,
          b5: 0,
          b6: -1,
          b7: 2,
          b8: 5,
          b9: 6,
        },
      },
    ],
    buildOp: (v) => ({
      type: 'tenBandEq',
      gainsDb: Array.from({ length: 10 }, (_, i) => num(v, `b${i}`, 0)),
    }),
  },
  {
    id: 'reverb',
    name: 'Reverb Pro',
    kind: 'native',
    params: [
      {
        key: 'preset',
        label: 'Room',
        kind: 'choice',
        defaultValue: 'mediumRoom',
        options: [
          { value: 'smallRoom', label: 'Small Room' },
          { value: 'mediumRoom', label: 'Medium Room' },
          { value: 'largeRoom', label: 'Large Room' },
          { value: 'mediumHall', label: 'Medium Hall' },
          { value: 'largeHall', label: 'Large Hall' },
          { value: 'plate', label: 'Plate' },
          { value: 'cathedral', label: 'Cathedral' },
        ],
      },
      slider('wetDryMix', 'Wet Gain', 0, 100, 30, 1, '%'),
    ],
    presets: [
      { name: 'Custom', values: {} },
      { name: 'Vocal I', values: { preset: 'mediumRoom', wetDryMix: 22 } },
      { name: 'Vocal II', values: { preset: 'plate', wetDryMix: 30 } },
      { name: 'Bathroom', values: { preset: 'smallRoom', wetDryMix: 45 } },
      { name: 'Small Room I', values: { preset: 'smallRoom', wetDryMix: 20 } },
      { name: 'Small Room II', values: { preset: 'smallRoom', wetDryMix: 35 } },
      { name: 'Medium Room', values: { preset: 'mediumRoom', wetDryMix: 35 } },
      { name: 'Large Room', values: { preset: 'largeRoom', wetDryMix: 40 } },
      { name: 'Hall', values: { preset: 'largeHall', wetDryMix: 45 } },
      { name: 'Cathedral', values: { preset: 'cathedral', wetDryMix: 55 } },
    ],
    buildOp: (v) => ({
      type: 'reverb',
      preset: str(v, 'preset', 'mediumRoom'),
      wetDryMix: num(v, 'wetDryMix', 30),
    }),
  },
  {
    id: 'bassBoost',
    name: 'Bass Boost',
    kind: 'native',
    params: [
      slider('gainDb', 'Gain', 0, 24, 6, 0.5, 'dB'),
      slider('frequencyHz', 'Frequency', 40, 300, 100, 5, 'Hz'),
    ],
    presets: [
      { name: 'Custom', values: {} },
      { name: 'Light', values: { gainDb: 3, frequencyHz: 100 } },
      { name: 'Medium', values: { gainDb: 6, frequencyHz: 100 } },
      { name: 'Heavy', values: { gainDb: 10, frequencyHz: 80 } },
    ],
    buildOp: (v) => ({
      type: 'bassBoost',
      gainDb: num(v, 'gainDb', 6),
      frequencyHz: num(v, 'frequencyHz', 100),
    }),
  },
  {
    id: 'amplify',
    name: 'Amplify',
    kind: 'native',
    params: [slider('gainDb', 'Gain', -30, 30, 3, 0.5, 'dB')],
    presets: [
      { name: 'Custom', values: {} },
      { name: '+3 dB', values: { gainDb: 3 } },
      { name: '+6 dB', values: { gainDb: 6 } },
      { name: '+10 dB', values: { gainDb: 10 } },
      { name: 'Half', values: { gainDb: -6 } },
    ],
    buildOp: (v) => ({ type: 'amplify', gainDb: num(v, 'gainDb', 3) }),
  },
  {
    id: 'compressor',
    name: 'Compressor',
    kind: 'native',
    params: [
      slider('thresholdDb', 'Threshold', -60, 0, -20, 1, 'dB'),
      slider('ratio', 'Ratio', 1, 20, 4, 0.5, ':1'),
      slider('attackMs', 'Attack', 0.1, 200, 10, 0.1, 'ms'),
      slider('releaseMs', 'Release', 10, 1000, 100, 5, 'ms'),
      slider('makeupDb', 'Makeup', 0, 24, 3, 0.5, 'dB'),
    ],
    presets: [
      { name: 'Custom', values: {} },
      {
        name: 'Vocal',
        values: { thresholdDb: -18, ratio: 3, attackMs: 10, releaseMs: 120, makeupDb: 3 },
      },
      {
        name: 'Gentle',
        values: { thresholdDb: -24, ratio: 2, attackMs: 20, releaseMs: 200, makeupDb: 2 },
      },
      {
        name: 'Hard',
        values: { thresholdDb: -30, ratio: 8, attackMs: 2, releaseMs: 60, makeupDb: 6 },
      },
      {
        name: 'Limiter',
        values: { thresholdDb: -6, ratio: 20, attackMs: 0.5, releaseMs: 50, makeupDb: 0 },
      },
    ],
    buildOp: (v) => ({
      type: 'compressor',
      thresholdDb: num(v, 'thresholdDb', -20),
      ratio: num(v, 'ratio', 4),
      attackMs: num(v, 'attackMs', 10),
      releaseMs: num(v, 'releaseMs', 100),
      makeupDb: num(v, 'makeupDb', 3),
    }),
  },
  {
    id: 'changePitch',
    name: 'Change Pitch',
    kind: 'native',
    params: [slider('cents', 'Pitch', -1200, 1200, 0, 10, 'cents')],
    presets: [
      { name: 'Custom', values: {} },
      { name: 'Octave down', values: { cents: -1200 } },
      { name: 'Fifth down', values: { cents: -700 } },
      { name: 'Semitone down', values: { cents: -100 } },
      { name: 'Semitone up', values: { cents: 100 } },
      { name: 'Fifth up', values: { cents: 700 } },
      { name: 'Octave up', values: { cents: 1200 } },
    ],
    buildOp: (v) => ({ type: 'changePitch', cents: num(v, 'cents', 0) }),
  },
  {
    id: 'changeTempo',
    name: 'Change Tempo',
    kind: 'native',
    params: [slider('rate', 'Tempo', 0.5, 2, 1, 0.01, 'x')],
    presets: [
      { name: 'Custom', values: {} },
      { name: 'Half', values: { rate: 0.5 } },
      { name: 'Slower', values: { rate: 0.8 } },
      { name: 'Faster', values: { rate: 1.25 } },
      { name: 'Double', values: { rate: 2 } },
    ],
    buildOp: (v) => ({ type: 'changeTempo', rate: num(v, 'rate', 1) }),
  },
  {
    id: 'normalize',
    name: 'Normalize',
    kind: 'native',
    params: [slider('peakDb', 'Peak', -20, 0, -1, 0.5, 'dB')],
    presets: [
      { name: 'Custom', values: {} },
      { name: '-1 dB', values: { peakDb: -1 } },
      { name: '-3 dB', values: { peakDb: -3 } },
      { name: '-6 dB', values: { peakDb: -6 } },
    ],
    buildOp: (v) => ({ type: 'normalize', peakDb: num(v, 'peakDb', -1) }),
  },
  {
    id: 'fadeIn',
    name: 'Fade In',
    kind: 'native',
    params: [
      {
        key: 'curve',
        label: 'Curve',
        kind: 'choice',
        defaultValue: 'linear',
        options: [
          { value: 'linear', label: 'Linear' },
          { value: 'log', label: 'Logarithmic' },
        ],
      },
    ],
    presets: [],
    buildOp: (v) => ({ type: 'fadeIn', curve: str(v, 'curve', 'linear') }),
  },
  {
    id: 'fadeOut',
    name: 'Fade Out',
    kind: 'native',
    params: [
      {
        key: 'curve',
        label: 'Curve',
        kind: 'choice',
        defaultValue: 'linear',
        options: [
          { value: 'linear', label: 'Linear' },
          { value: 'log', label: 'Logarithmic' },
        ],
      },
    ],
    presets: [],
    buildOp: (v) => ({ type: 'fadeOut', curve: str(v, 'curve', 'linear') }),
  },
  {
    id: 'phaser',
    name: 'Phaser',
    kind: 'native',
    params: [
      slider('rateHz', 'Rate', 0.1, 10, 0.5, 0.1, 'Hz'),
      slider('depth', 'Depth', 0, 1, 0.7, 0.05),
      slider('feedback', 'Feedback', 0, 0.95, 0.5, 0.05),
      slider('stages', 'Stages', 2, 12, 4, 2),
    ],
    presets: [
      { name: 'Custom', values: {} },
      { name: 'Slow', values: { rateHz: 0.3, depth: 0.7, feedback: 0.4, stages: 4 } },
      { name: 'Classic', values: { rateHz: 0.8, depth: 0.8, feedback: 0.6, stages: 6 } },
      { name: 'Fast', values: { rateHz: 3, depth: 0.6, feedback: 0.5, stages: 4 } },
    ],
    buildOp: (v) => ({
      type: 'phaser',
      rateHz: num(v, 'rateHz', 0.5),
      depth: num(v, 'depth', 0.7),
      feedback: num(v, 'feedback', 0.5),
      stages: Math.round(num(v, 'stages', 4)),
    }),
  },
  {
    id: 'repeat',
    name: 'Repeat',
    kind: 'native',
    params: [slider('count', 'Times', 1, 20, 2, 1)],
    presets: [],
    buildOp: (v) => ({ type: 'repeat', count: Math.round(num(v, 'count', 2)) }),
  },
  {
    id: 'censorBleep',
    name: 'Censor Bleep',
    kind: 'native',
    params: [
      slider('frequencyHz', 'Frequency', 200, 4000, 1000, 50, 'Hz'),
      slider('gainDb', 'Level', -30, 0, -6, 1, 'dB'),
    ],
    presets: [],
    buildOp: (v) => ({
      type: 'censorBleep',
      frequencyHz: num(v, 'frequencyHz', 1000),
      gainDb: num(v, 'gainDb', -6),
    }),
  },
  {
    id: 'reverse',
    name: 'Reverse',
    kind: 'native',
    params: [],
    presets: [],
    buildOp: () => ({ type: 'reverse' }),
  },
  {
    id: 'echo',
    name: 'Echo',
    kind: 'native',
    params: [
      slider('delayMs', 'Delay', 20, 2000, 300, 10, 'ms'),
      slider('decay', 'Decay', 0, 0.95, 0.5, 0.05),
      slider('repeats', 'Repeats', 1, 10, 3, 1),
    ],
    presets: [
      { name: 'Custom', values: {} },
      { name: 'Slapback', values: { delayMs: 90, decay: 0.4, repeats: 1 } },
      { name: 'Canyon', values: { delayMs: 600, decay: 0.6, repeats: 5 } },
    ],
    buildOp: (v) => ({
      type: 'echo',
      delayMs: num(v, 'delayMs', 300),
      decay: num(v, 'decay', 0.5),
      repeats: Math.round(num(v, 'repeats', 3)),
    }),
  },
  {
    id: 'tapeDelay',
    name: 'Tape Delay',
    kind: 'native',
    params: [
      slider('delayMs', 'Delay', 20, 2000, 400, 10, 'ms'),
      slider('feedback', 'Feedback', 0, 100, 40, 1, '%'),
      slider('wetDry', 'Wet Dry', 0, 100, 35, 1, '%'),
      slider('lowPassHz', 'Low Pass', 500, 20000, 6000, 100, 'Hz'),
    ],
    presets: [
      { name: 'Custom', values: {} },
      {
        name: 'Warm',
        values: { delayMs: 380, feedback: 45, wetDry: 30, lowPassHz: 4000 },
      },
      {
        name: 'Dub',
        values: { delayMs: 500, feedback: 70, wetDry: 50, lowPassHz: 3000 },
      },
    ],
    buildOp: (v) => ({
      type: 'tapeDelay',
      delayMs: num(v, 'delayMs', 400),
      feedback: num(v, 'feedback', 40),
      wetDry: num(v, 'wetDry', 35),
      lowPassHz: num(v, 'lowPassHz', 6000),
    }),
  },
  {
    id: 'paulstretch',
    name: 'Paulstretch',
    kind: 'native',
    params: [
      slider('factor', 'Stretch', 2, 50, 8, 1, 'x'),
      slider('windowSec', 'Window', 0.05, 1, 0.25, 0.05, 's'),
    ],
    presets: [],
    buildOp: (v) => ({
      type: 'paulstretch',
      factor: num(v, 'factor', 8),
      windowSec: num(v, 'windowSec', 0.25),
    }),
  },
  {
    id: 'silenceRemover',
    name: 'Silence Remover',
    kind: 'native',
    params: [
      slider('thresholdDb', 'Threshold', -80, -10, -40, 1, 'dB'),
      slider('minSilenceMs', 'Min Silence', 50, 3000, 300, 50, 'ms'),
      slider('keepMs', 'Keep', 0, 500, 50, 10, 'ms'),
    ],
    presets: [],
    buildOp: (v) => ({
      type: 'silenceRemover',
      thresholdDb: num(v, 'thresholdDb', -40),
      minSilenceMs: num(v, 'minSilenceMs', 300),
      keepMs: num(v, 'keepMs', 50),
    }),
  },
  {
    id: 'noiseGenerator',
    name: 'Noise Generator',
    kind: 'native',
    params: [
      {
        key: 'kind',
        label: 'Color',
        kind: 'choice',
        defaultValue: 'white',
        options: [
          { value: 'white', label: 'White' },
          { value: 'pink', label: 'Pink' },
          { value: 'brown', label: 'Brown' },
        ],
      },
      slider('amplitudeDb', 'Level', -60, 0, -20, 1, 'dB'),
    ],
    presets: [],
    buildOp: (v) => ({
      type: 'noiseGenerator',
      kind: str(v, 'kind', 'white'),
      amplitudeDb: num(v, 'amplitudeDb', -20),
    }),
  },
  {
    id: 'denoise',
    name: 'Denoise',
    kind: 'native',
    params: [slider('strengthDb', 'Strength', 0, 30, 12, 1, 'dB')],
    presets: [
      { name: 'Custom', values: {} },
      { name: 'Light', values: { strengthDb: 6 } },
      { name: 'Medium', values: { strengthDb: 12 } },
      { name: 'Strong', values: { strengthDb: 20 } },
    ],
    buildOp: (v) => ({ type: 'denoise', strengthDb: num(v, 'strengthDb', 12) }),
  },
  {
    id: 'centerCut',
    name: 'Center Cut',
    kind: 'native',
    params: [],
    presets: [],
    buildOp: () => ({ type: 'centerCut' }),
  },
  {
    id: 'wahwah',
    name: 'Wahwah',
    kind: 'native',
    params: [
      slider('rateHz', 'Rate', 0.1, 10, 1.5, 0.1, 'Hz'),
      slider('depth', 'Depth', 0, 1, 0.7, 0.05),
      slider('resonance', 'Resonance', 0.5, 10, 2.5, 0.1),
    ],
    presets: [
      { name: 'Custom', values: {} },
      { name: 'Slow', values: { rateHz: 0.6, depth: 0.8, resonance: 3 } },
      { name: 'Funky', values: { rateHz: 2.5, depth: 0.7, resonance: 4 } },
    ],
    buildOp: (v) => ({
      type: 'wahwah',
      rateHz: num(v, 'rateHz', 1.5),
      depth: num(v, 'depth', 0.7),
      resonance: num(v, 'resonance', 2.5),
    }),
  },
];

export function defaultValuesFor(def: EffectDef): EffectValues {
  const out: EffectValues = {};
  for (const p of def.params) out[p.key] = p.defaultValue;
  return out;
}
