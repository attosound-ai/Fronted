import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import NativeSlider from '@react-native-community/slider';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Text } from '@/components/ui/Text';
import { haptic } from '@/lib/haptics/hapticService';
import { STUDIO_COLORS } from './studioTheme';

export interface MasterEffects {
  pitchSemitones?: number;
  tempoRate?: number;
  reverb?: { preset?: string; wetDryMix?: number };
  eqGainsDb?: number[];
}

interface Props {
  visible: boolean;
  onClose: () => void;
  value: MasterEffects;
  /** Live while dragging, committed on release (the editor saves on commit). */
  onChange: (next: MasterEffects, commit: boolean) => void;
}

type Tab = 'tune' | 'reverb' | 'eq';

/** Flip to false to open the master effects again; nothing else gates them. */
const MASTER_EFFECTS_LOCKED = true;

const EQ_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const REVERB_PRESETS = [
  'smallRoom',
  'mediumRoom',
  'largeRoom',
  'plate',
  'largeHall',
  'cathedral',
];

function pitchLabel(semitones: number, normal: string): string {
  if (Math.abs(semitones) < 0.05) return normal;
  const rounded = Math.round(semitones * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded}`;
}

function tempoLabel(rate: number, normal: string): string {
  if (Math.abs(rate - 1) < 0.005) return normal;
  return `${Math.round(rate * 100)}%`;
}

/**
 * SoundLab's Master Effects sheet, three tabs over the whole mix: Tune
 * (pitch and tempo with steppers and a reset), Reverb and a ten band
 * equalizer. The values live on the project so the export applies exactly
 * what the editor previews.
 */
export function MasterEffectsSheet({ visible, onClose, value, onChange }: Props) {
  const { t } = useTranslation('projects');
  const [tab, setTab] = useState<Tab>('tune');
  const [draft, setDraft] = useState<MasterEffects>(value);

  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);

  const push = useCallback(
    (next: MasterEffects, commit: boolean) => {
      setDraft(next);
      onChange(next, commit);
    },
    [onChange]
  );

  const pitch = draft.pitchSemitones ?? 0;
  const tempo = draft.tempoRate ?? 1;
  const wet = draft.reverb?.wetDryMix ?? 0;
  const preset = draft.reverb?.preset ?? 'mediumRoom';
  const gains = draft.eqGainsDb ?? new Array(10).fill(0);

  const step = (key: 'pitch' | 'tempo', delta: number) => {
    void haptic('light');
    if (key === 'pitch') {
      push(
        { ...draft, pitchSemitones: Math.max(-12, Math.min(12, pitch + delta)) },
        true
      );
    } else {
      push(
        {
          ...draft,
          tempoRate: Math.max(0.5, Math.min(2, Math.round((tempo + delta) * 100) / 100)),
        },
        true
      );
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('studio.master.title')}
      detents={[0.66]}
    >
      <View style={styles.notice}>
        <Text variant="caption" style={styles.noticeText}>
          {t('studio.master.inDevelopment')}
        </Text>
      </View>
      <View style={styles.tabs}>
        {(['tune', 'reverb', 'eq'] as Tab[]).map((key) => (
          <Pressable
            key={key}
            onPress={() => {
              void haptic('selection');
              setTab(key);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: tab === key }}
            style={[styles.tab, tab === key && styles.tabActive]}
          >
            <Text
              variant="small"
              style={[styles.tabText, tab === key && styles.tabTextActive]}
            >
              {t(`studio.master.${key}` as 'studio.master.tune')}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Locked while the master effects are being built: visible, inert. */}
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        pointerEvents={MASTER_EFFECTS_LOCKED ? 'none' : 'auto'}
        style={MASTER_EFFECTS_LOCKED && styles.locked}
      >
        {tab === 'tune' && (
          <>
            <View style={styles.stepperRow}>
              <Pressable
                onPress={() => step('pitch', -1)}
                hitSlop={10}
                accessibilityRole="button"
              >
                <ChevronLeft size={22} color={STUDIO_COLORS.text} strokeWidth={2.5} />
              </Pressable>
              <Text variant="body" style={styles.paramTitle}>
                {t('studio.master.pitch', {
                  value: pitchLabel(pitch, t('studio.master.normal')),
                })}
              </Text>
              <Pressable
                onPress={() => step('pitch', 1)}
                hitSlop={10}
                accessibilityRole="button"
              >
                <ChevronRight size={22} color={STUDIO_COLORS.text} strokeWidth={2.5} />
              </Pressable>
            </View>
            <View style={styles.sliderRow}>
              <NativeSlider
                style={styles.slider}
                minimumValue={-12}
                maximumValue={12}
                step={0.1}
                value={pitch}
                onValueChange={(v) => push({ ...draft, pitchSemitones: v }, false)}
                onSlidingComplete={(v) => push({ ...draft, pitchSemitones: v }, true)}
                minimumTrackTintColor={STUDIO_COLORS.text}
                maximumTrackTintColor={STUDIO_COLORS.borderStrong}
                thumbTintColor={STUDIO_COLORS.text}
              />
              <Pressable
                onPress={() => push({ ...draft, pitchSemitones: 0 }, true)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t('studio.master.reset')}
              >
                <RotateCcw size={18} color={STUDIO_COLORS.textMuted} strokeWidth={2.25} />
              </Pressable>
            </View>

            <View style={[styles.stepperRow, styles.spaced]}>
              <Pressable
                onPress={() => step('tempo', -0.05)}
                hitSlop={10}
                accessibilityRole="button"
              >
                <ChevronLeft size={22} color={STUDIO_COLORS.text} strokeWidth={2.5} />
              </Pressable>
              <Text variant="body" style={styles.paramTitle}>
                {t('studio.master.tempo', {
                  value: tempoLabel(tempo, t('studio.master.normal')),
                })}
              </Text>
              <Pressable
                onPress={() => step('tempo', 0.05)}
                hitSlop={10}
                accessibilityRole="button"
              >
                <ChevronRight size={22} color={STUDIO_COLORS.text} strokeWidth={2.5} />
              </Pressable>
            </View>
            <View style={styles.sliderRow}>
              <NativeSlider
                style={styles.slider}
                minimumValue={0.5}
                maximumValue={2}
                step={0.01}
                value={tempo}
                onValueChange={(v) => push({ ...draft, tempoRate: v }, false)}
                onSlidingComplete={(v) => push({ ...draft, tempoRate: v }, true)}
                minimumTrackTintColor={STUDIO_COLORS.text}
                maximumTrackTintColor={STUDIO_COLORS.borderStrong}
                thumbTintColor={STUDIO_COLORS.text}
              />
              <Pressable
                onPress={() => push({ ...draft, tempoRate: 1 }, true)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t('studio.master.reset')}
              >
                <RotateCcw size={18} color={STUDIO_COLORS.textMuted} strokeWidth={2.25} />
              </Pressable>
            </View>
          </>
        )}

        {tab === 'reverb' && (
          <>
            <View style={styles.chips}>
              {REVERB_PRESETS.map((p) => (
                <Pressable
                  key={p}
                  onPress={() => {
                    void haptic('selection');
                    push({ ...draft, reverb: { preset: p, wetDryMix: wet || 25 } }, true);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: preset === p }}
                  style={[styles.chip, preset === p && styles.chipActive]}
                >
                  <Text
                    variant="caption"
                    style={[styles.chipText, preset === p && styles.chipTextActive]}
                  >
                    {t(`studio.master.presets.${p}` as 'studio.master.presets.plate')}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text variant="body" style={styles.paramTitle}>
              {t('studio.master.wet', { value: Math.round(wet) })}
            </Text>
            <View style={styles.sliderRow}>
              <NativeSlider
                style={styles.slider}
                minimumValue={0}
                maximumValue={100}
                step={1}
                value={wet}
                onValueChange={(v) =>
                  push({ ...draft, reverb: { preset, wetDryMix: v } }, false)
                }
                onSlidingComplete={(v) =>
                  push({ ...draft, reverb: { preset, wetDryMix: v } }, true)
                }
                minimumTrackTintColor={STUDIO_COLORS.text}
                maximumTrackTintColor={STUDIO_COLORS.borderStrong}
                thumbTintColor={STUDIO_COLORS.text}
              />
              <Pressable
                onPress={() => push({ ...draft, reverb: { preset, wetDryMix: 0 } }, true)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t('studio.master.reset')}
              >
                <RotateCcw size={18} color={STUDIO_COLORS.textMuted} strokeWidth={2.25} />
              </Pressable>
            </View>
          </>
        )}

        {tab === 'eq' && (
          <>
            {EQ_BANDS.map((hz, i) => (
              <View key={hz} style={styles.eqRow}>
                <Text variant="caption" style={styles.eqLabel}>
                  {hz >= 1000 ? `${hz / 1000}k` : hz}
                </Text>
                <NativeSlider
                  style={styles.slider}
                  minimumValue={-12}
                  maximumValue={12}
                  step={0.5}
                  value={gains[i] ?? 0}
                  onValueChange={(v) => {
                    const next = [...gains];
                    next[i] = v;
                    push({ ...draft, eqGainsDb: next }, false);
                  }}
                  onSlidingComplete={(v) => {
                    const next = [...gains];
                    next[i] = v;
                    push({ ...draft, eqGainsDb: next }, true);
                  }}
                  minimumTrackTintColor={STUDIO_COLORS.text}
                  maximumTrackTintColor={STUDIO_COLORS.borderStrong}
                  thumbTintColor={STUDIO_COLORS.text}
                />
                <Text variant="caption" style={styles.eqValue}>
                  {(gains[i] ?? 0) > 0 ? '+' : ''}
                  {(gains[i] ?? 0).toFixed(1)}
                </Text>
              </View>
            ))}
            <Pressable
              onPress={() => push({ ...draft, eqGainsDb: new Array(10).fill(0) }, true)}
              accessibilityRole="button"
              style={styles.resetAll}
            >
              <Text variant="small" style={styles.resetAllText}>
                {t('studio.master.flat')}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  locked: {
    opacity: 0.32,
  },
  notice: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: STUDIO_COLORS.borderStrong,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  noticeText: {
    color: STUDIO_COLORS.text,
    textAlign: 'center',
  },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 4,
    borderRadius: 18,
    backgroundColor: STUDIO_COLORS.surfaceRaised,
    padding: 3,
  },
  tab: {
    flex: 1,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: STUDIO_COLORS.primary,
  },
  tabText: {
    color: STUDIO_COLORS.text,
  },
  tabTextActive: {
    color: STUDIO_COLORS.onPrimary,
    fontFamily: 'Archivo_600SemiBold',
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 30,
  },
  spaced: {
    marginTop: 28,
  },
  paramTitle: {
    color: STUDIO_COLORS.text,
    fontFamily: 'Archivo_700Bold',
    textAlign: 'center',
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  slider: {
    flex: 1,
    height: 34,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: STUDIO_COLORS.borderStrong,
  },
  chipActive: {
    backgroundColor: STUDIO_COLORS.primary,
    borderColor: STUDIO_COLORS.primary,
  },
  chipText: {
    color: STUDIO_COLORS.text,
  },
  chipTextActive: {
    color: STUDIO_COLORS.onPrimary,
  },
  eqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
  },
  eqLabel: {
    width: 40,
    color: STUDIO_COLORS.textMuted,
  },
  eqValue: {
    width: 46,
    textAlign: 'right',
    color: STUDIO_COLORS.text,
    fontVariant: ['tabular-nums'],
  },
  resetAll: {
    alignSelf: 'center',
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: STUDIO_COLORS.borderStrong,
  },
  resetAllText: {
    color: STUDIO_COLORS.text,
  },
});
