import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Switch,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {
  Sparkles,
  Waves,
  Repeat,
  ArrowUpDown,
  Mic,
  Minus,
  Plus,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Slider } from '@/components/ui/Slider';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { haptic } from '@/lib/haptics/hapticService';
import i18n from '@/lib/i18n';
import type { EffectChain } from '../../../../modules/atto-audio-transcode';

/**
 * EffectsSheet — per-clip, NON-destructive effects for the vocal-over-a-beat
 * flow. Presets first (one tap gets a produced vocal), then a few honest
 * controls. Nothing here touches audio: the sheet only edits an EffectChain
 * draft and hands it to `onApply`, which renders it on-device from the DRY
 * original (see useClipEffects). Removing effects just points the clip back at
 * that original, so every choice is reversible.
 *
 * The chain is rendered by Apple's own Audio Units (EQ / Dynamics Processor /
 * Reverb / Delay / TimePitch); the knobs below map to those parameters with
 * ranges tuned for a phone-line vocal. Pitch is in semitones; time-stretch is
 * deliberately not exposed (it changes the take's length under a beat).
 */

interface EffectsSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Chain currently applied to the selected clip (null = dry). */
  initialChain: EffectChain | null;
  /** Human label of the selected clip for the header (e.g. "Verse 1 · 0:12"). */
  clipLabel?: string;
  /** Render + apply. Resolves when the clip has been swapped to the render. */
  onApply: (chain: EffectChain) => Promise<void>;
  /** Point the clip back at its dry original. */
  onRemove: () => Promise<void>;
  /** True while a render/upload is in flight (controls are locked). */
  busy: boolean;
  /** False on binaries that predate the renderer, or off-iOS. */
  available: boolean;
}

// Untyped lookup with an inline fallback so the sheet is usable before the
// locale files carry these keys (they are added alongside the editor toolbar).
const tx = (key: string, def: string): string =>
  i18n.t(`projects:${key}`, { defaultValue: def });

type ReverbPreset = NonNullable<NonNullable<EffectChain['reverb']>['preset']>;

/** Editable draft: 0..1 amounts + toggles, converted to an EffectChain on apply. */
interface Draft {
  cleanUp: boolean;
  cleanUpAmount: number; // → high-pass 60..240 Hz
  compress: boolean;
  compressAmount: number; // → threshold / head room / make-up
  reverb: boolean;
  reverbPreset: ReverbPreset;
  reverbAmount: number; // → wet/dry 0..60
  delay: boolean;
  delayAmount: number; // → wet/dry 0..50
  pitchSemis: number; // -12..12
}

const DRY: Draft = {
  cleanUp: false,
  cleanUpAmount: 0.3,
  compress: false,
  compressAmount: 0.5,
  reverb: false,
  reverbPreset: 'mediumHall',
  reverbAmount: 0.4,
  delay: false,
  delayAmount: 0.4,
  pitchSemis: 0,
};

/** One-tap starting points, tuned for a spoken/sung phone-line vocal. */
const PRESETS: { key: string; label: string; draft: Partial<Draft> }[] = [
  {
    key: 'clean',
    label: 'Clean',
    draft: { cleanUp: true, cleanUpAmount: 0.3, compress: true, compressAmount: 0.4 },
  },
  {
    key: 'warm',
    label: 'Warm',
    draft: { cleanUp: true, cleanUpAmount: 0.15, compress: true, compressAmount: 0.5 },
  },
  {
    key: 'radio',
    label: 'Radio',
    draft: { cleanUp: true, cleanUpAmount: 0.8, compress: true, compressAmount: 0.9 },
  },
  {
    key: 'hall',
    label: 'Hall',
    draft: {
      cleanUp: true,
      cleanUpAmount: 0.3,
      compress: true,
      compressAmount: 0.45,
      reverb: true,
      reverbPreset: 'mediumHall',
      reverbAmount: 0.45,
    },
  },
  {
    key: 'plate',
    label: 'Plate',
    draft: {
      cleanUp: true,
      cleanUpAmount: 0.3,
      compress: true,
      compressAmount: 0.45,
      reverb: true,
      reverbPreset: 'plate',
      reverbAmount: 0.35,
    },
  },
  {
    key: 'echo',
    label: 'Echo',
    draft: {
      cleanUp: true,
      cleanUpAmount: 0.3,
      compress: true,
      compressAmount: 0.4,
      delay: true,
      delayAmount: 0.5,
    },
  },
];

const REVERB_PRESETS: { key: ReverbPreset; label: string }[] = [
  { key: 'mediumRoom', label: 'Room' },
  { key: 'mediumHall', label: 'Hall' },
  { key: 'plate', label: 'Plate' },
  { key: 'cathedral', label: 'Cathedral' },
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Draft → the chain the native renderer understands. */
function draftToChain(d: Draft): EffectChain {
  const chain: EffectChain = {};
  if (d.cleanUp) {
    chain.eq = {
      highPassHz: Math.round(lerp(60, 240, d.cleanUpAmount)),
      presenceDb: Math.round(lerp(0, 4, d.cleanUpAmount) * 10) / 10,
    };
  }
  if (d.compress) {
    chain.compressor = {
      thresholdDb: Math.round(lerp(-10, -35, d.compressAmount)),
      headRoomDb: Math.round(lerp(20, 4, d.compressAmount)),
      attackMs: 10,
      releaseMs: 120,
      makeupDb: Math.round(lerp(0, 6, d.compressAmount)),
    };
  }
  if (d.reverb) {
    chain.reverb = {
      preset: d.reverbPreset,
      wetDryMix: Math.round(lerp(0, 60, d.reverbAmount)),
    };
  }
  if (d.delay) {
    chain.delay = {
      timeMs: 300,
      feedback: 30,
      wetDryMix: Math.round(lerp(0, 50, d.delayAmount)),
      lowPassCutoffHz: 5000,
    };
  }
  if (d.pitchSemis !== 0) {
    chain.pitchTime = { pitchCents: d.pitchSemis * 100, rate: 1 };
  }
  return chain;
}

/** Chain → draft, so reopening the sheet shows what is applied. */
function chainToDraft(c: EffectChain | null): Draft {
  if (!c) return DRY;
  const d: Draft = { ...DRY };
  if (c.eq) {
    d.cleanUp = true;
    d.cleanUpAmount = Math.min(1, Math.max(0, ((c.eq.highPassHz ?? 60) - 60) / 180));
  }
  if (c.compressor) {
    d.compress = true;
    d.compressAmount = Math.min(
      1,
      Math.max(0, (-(c.compressor.thresholdDb ?? -10) - 10) / 25)
    );
  }
  if (c.reverb) {
    d.reverb = true;
    d.reverbPreset = c.reverb.preset ?? 'mediumHall';
    d.reverbAmount = Math.min(1, (c.reverb.wetDryMix ?? 0) / 60);
  }
  if (c.delay) {
    d.delay = true;
    d.delayAmount = Math.min(1, (c.delay.wetDryMix ?? 0) / 50);
  }
  if (c.pitchTime?.pitchCents) {
    d.pitchSemis = Math.max(-12, Math.min(12, Math.round(c.pitchTime.pitchCents / 100)));
  }
  return d;
}

export function EffectsSheet({
  visible,
  onClose,
  initialChain,
  clipLabel,
  onApply,
  onRemove,
  busy,
  available,
}: EffectsSheetProps) {
  const [draft, setDraft] = useState<Draft>(() => chainToDraft(initialChain));

  // Re-seed from the clip each time the sheet opens (a different clip may be
  // selected), never while the user is editing.
  useEffect(() => {
    if (visible) setDraft(chainToDraft(initialChain));
  }, [visible, initialChain]);

  const hasAny =
    draft.cleanUp ||
    draft.compress ||
    draft.reverb ||
    draft.delay ||
    draft.pitchSemis !== 0;

  const applyPreset = useCallback((p: (typeof PRESETS)[number]) => {
    void haptic('selection');
    setDraft({ ...DRY, ...p.draft });
  }, []);

  const toggle = useCallback((key: keyof Draft, on: boolean) => {
    void haptic('selection');
    setDraft((d) => ({ ...d, [key]: on }));
  }, []);

  const setAmount = useCallback((key: keyof Draft, v: number) => {
    setDraft((d) => ({ ...d, [key]: v }));
  }, []);

  const bumpPitch = useCallback((delta: number) => {
    void haptic('selection');
    setDraft((d) => ({
      ...d,
      pitchSemis: Math.max(-12, Math.min(12, d.pitchSemis + delta)),
    }));
  }, []);

  const handleApply = useCallback(async () => {
    if (busy) return;
    void haptic('medium');
    await onApply(draftToChain(draft));
  }, [busy, draft, onApply]);

  const handleRemove = useCallback(async () => {
    if (busy) return;
    void haptic('medium');
    await onRemove();
  }, [busy, onRemove]);

  const pitchLabel = useMemo(() => {
    if (draft.pitchSemis === 0) return '0';
    return draft.pitchSemis > 0 ? `+${draft.pitchSemis}` : `${draft.pitchSemis}`;
  }, [draft.pitchSemis]);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={tx('effects.title', 'Effects')}
    >
      <View style={styles.body}>
        {clipLabel ? <Text style={styles.clipLabel}>{clipLabel}</Text> : null}

        {!available && (
          <Text style={styles.unavailable}>
            {tx('effects.unavailable', 'Effects need the latest ATTO build.')}
          </Text>
        )}

        {/* Presets: one tap to a produced vocal. */}
        <Text style={styles.sectionLabel}>{tx('effects.presets', 'Presets')}</Text>
        <View style={styles.chipRow}>
          {PRESETS.map((p) => (
            <TouchableOpacity
              key={p.key}
              style={styles.chip}
              onPress={() => applyPreset(p)}
              disabled={busy || !available}
            >
              <Text style={styles.chipText}>
                {tx(`effects.preset.${p.key}`, p.label)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Clean up (high-pass + a little presence) */}
        <EffectRow
          Icon={Mic}
          label={tx('effects.cleanUp', 'Clean up')}
          hint={tx('effects.cleanUpHint', 'Cuts rumble and phone noise')}
          on={draft.cleanUp}
          onToggle={(v) => toggle('cleanUp', v)}
          amount={draft.cleanUpAmount}
          onAmount={(v) => setAmount('cleanUpAmount', v)}
          disabled={busy || !available}
        />

        {/* Compression */}
        <EffectRow
          Icon={Sparkles}
          label={tx('effects.compress', 'Even out')}
          hint={tx('effects.compressHint', 'Keeps the vocal present over the beat')}
          on={draft.compress}
          onToggle={(v) => toggle('compress', v)}
          amount={draft.compressAmount}
          onAmount={(v) => setAmount('compressAmount', v)}
          disabled={busy || !available}
        />

        {/* Reverb + space picker */}
        <EffectRow
          Icon={Waves}
          label={tx('effects.reverb', 'Space')}
          hint={tx('effects.reverbHint', 'Puts the vocal in a room')}
          on={draft.reverb}
          onToggle={(v) => toggle('reverb', v)}
          amount={draft.reverbAmount}
          onAmount={(v) => setAmount('reverbAmount', v)}
          disabled={busy || !available}
        >
          <View style={styles.chipRow}>
            {REVERB_PRESETS.map((r) => {
              const active = draft.reverbPreset === r.key;
              return (
                <TouchableOpacity
                  key={r.key}
                  style={[styles.chipSmall, active && styles.chipSmallActive]}
                  onPress={() => {
                    void haptic('selection');
                    setDraft((d) => ({ ...d, reverbPreset: r.key }));
                  }}
                  disabled={busy || !available || !draft.reverb}
                >
                  <Text
                    style={[styles.chipSmallText, active && styles.chipSmallTextActive]}
                  >
                    {tx(`effects.space.${r.key}`, r.label)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </EffectRow>

        {/* Delay */}
        <EffectRow
          Icon={Repeat}
          label={tx('effects.delay', 'Echo')}
          hint={tx('effects.delayHint', 'A short repeat behind the voice')}
          on={draft.delay}
          onToggle={(v) => toggle('delay', v)}
          amount={draft.delayAmount}
          onAmount={(v) => setAmount('delayAmount', v)}
          disabled={busy || !available}
        />

        {/* Pitch in semitones */}
        <View style={styles.pitchRow}>
          <View style={styles.rowLabel}>
            <ArrowUpDown
              size={18}
              color={draft.pitchSemis !== 0 ? '#3B82F6' : '#666'}
              strokeWidth={2.25}
            />
            <View>
              <Text style={styles.rowName}>{tx('effects.pitch', 'Pitch')}</Text>
              <Text style={styles.rowHint}>{tx('effects.pitchHint', 'Semitones')}</Text>
            </View>
          </View>
          <View style={styles.stepper}>
            <TouchableOpacity
              style={styles.stepBtn}
              onPress={() => bumpPitch(-1)}
              disabled={busy || !available || draft.pitchSemis <= -12}
            >
              <Minus size={18} color="#FFF" strokeWidth={2.5} />
            </TouchableOpacity>
            <Text style={styles.stepValue}>{pitchLabel}</Text>
            <TouchableOpacity
              style={styles.stepBtn}
              onPress={() => bumpPitch(1)}
              disabled={busy || !available || draft.pitchSemis >= 12}
            >
              <Plus size={18} color="#FFF" strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          {initialChain ? (
            <TouchableOpacity
              style={[styles.btn, styles.btnGhost]}
              onPress={handleRemove}
              disabled={busy}
            >
              <Text style={styles.btnGhostText}>
                {tx('effects.remove', 'Remove effects')}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <TouchableOpacity
            style={[
              styles.btn,
              styles.btnPrimary,
              (!hasAny || busy || !available) && styles.btnOff,
            ]}
            onPress={handleApply}
            disabled={!hasAny || busy || !available}
          >
            {busy ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.btnPrimaryText}>{tx('effects.apply', 'Apply')}</Text>
            )}
          </TouchableOpacity>
        </View>
        <Text style={styles.footnote}>
          {tx(
            'effects.footnote',
            'Renders a new take from the dry original. You can always remove it.'
          )}
        </Text>
      </View>
    </BottomSheet>
  );
}

interface EffectRowProps {
  Icon: typeof Mic;
  label: string;
  hint: string;
  on: boolean;
  onToggle: (v: boolean) => void;
  amount: number;
  onAmount: (v: number) => void;
  disabled: boolean;
  children?: React.ReactNode;
}

function EffectRow({
  Icon,
  label,
  hint,
  on,
  onToggle,
  amount,
  onAmount,
  disabled,
  children,
}: EffectRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <View style={styles.rowLabel}>
          <Icon size={18} color={on ? '#3B82F6' : '#666'} strokeWidth={2.25} />
          <View>
            <Text style={[styles.rowName, !on && styles.rowNameOff]}>{label}</Text>
            <Text style={styles.rowHint}>{hint}</Text>
          </View>
        </View>
        <Switch
          value={on}
          onValueChange={onToggle}
          trackColor={{ false: '#333', true: '#3B82F6' }}
          thumbColor="#FFF"
          disabled={disabled}
        />
      </View>
      <Slider
        value={amount}
        onChange={onAmount}
        disabled={disabled || !on}
        minimumTrackColor="#3B82F6"
      />
      {on ? children : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 18,
    paddingBottom: 8,
    gap: 4,
  },
  clipLabel: {
    color: '#888',
    fontFamily: 'Archivo_500Medium',
    fontSize: 13,
    marginBottom: 6,
  },
  unavailable: {
    color: '#F59E0B',
    fontFamily: 'Archivo_500Medium',
    fontSize: 13,
    marginBottom: 8,
  },
  sectionLabel: {
    color: '#888',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#1F1F1F',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  chipText: {
    color: '#FFF',
    fontFamily: 'Archivo_500Medium',
    fontSize: 13,
  },
  chipSmall: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#262626',
  },
  chipSmallActive: {
    borderColor: '#3B82F6',
    backgroundColor: '#0F1A2E',
  },
  chipSmallText: {
    color: '#AAA',
    fontFamily: 'Archivo_500Medium',
    fontSize: 12,
  },
  chipSmallTextActive: {
    color: '#FFF',
  },
  row: {
    paddingVertical: 6,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  rowLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  rowName: {
    color: '#FFF',
    fontFamily: 'Archivo_500Medium',
    fontSize: 15,
  },
  rowNameOff: {
    color: '#777',
  },
  rowHint: {
    color: '#666',
    fontFamily: 'Archivo_400Regular',
    fontSize: 12,
  },
  pitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1F1F1F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: {
    color: '#FFF',
    fontFamily: 'Archivo_700Bold',
    fontSize: 18,
    minWidth: 40,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  btn: {
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  btnPrimary: {
    backgroundColor: '#3B82F6',
    flex: 1,
  },
  btnPrimaryText: {
    color: '#FFF',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 15,
  },
  btnGhost: {
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    flex: 1,
  },
  btnGhostText: {
    color: '#EF4444',
    fontFamily: 'Archivo_500Medium',
    fontSize: 14,
  },
  btnOff: {
    opacity: 0.4,
  },
  footnote: {
    color: '#555',
    fontFamily: 'Archivo_400Regular',
    fontSize: 11,
    marginTop: 8,
    textAlign: 'center',
  },
});
