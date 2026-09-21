import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  Activity,
  AudioLines,
  CircleSlash,
  CloudFog,
  Disc3,
  Equal,
  Eraser,
  FlipHorizontal2,
  Gauge,
  MicOff,
  Music2,
  Music4,
  Radio,
  Repeat,
  Scissors,
  Sparkles,
  Timer,
  TrendingDown,
  TrendingUp,
  Volume2,
  Waves,
  Wind,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Text } from '@/components/ui/Text';
import { haptic } from '@/lib/haptics/hapticService';
import { EFFECTS, type EffectDef } from './effectsCatalog';
import { STUDIO_COLORS } from './studioTheme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onPick: (effect: EffectDef) => void;
  /** Range length, for the subtitle. */
  rangeLabel: string;
}

/**
 * Only these effects are open for now. The rest stay in the grid, greyed out
 * and inert, under a notice that they are still being built. To open one,
 * add its id here: nothing else gates it.
 */
const ENABLED_EFFECTS = new Set<string>(['amplify']);

const ICONS: Record<string, LucideIcon> = {
  aiVocalSeparator: MicOff,
  aiStemSeparator: Sparkles,
  deEss: Wind,
  aiNoiseSuppression: CloudFog,
  tenBandEq: Equal,
  reverb: Radio,
  bassBoost: Volume2,
  amplify: TrendingUp,
  compressor: Gauge,
  changePitch: Music2,
  changeTempo: Timer,
  normalize: Activity,
  fadeIn: TrendingUp,
  fadeOut: TrendingDown,
  phaser: Waves,
  repeat: Repeat,
  censorBleep: Zap,
  reverse: FlipHorizontal2,
  echo: AudioLines,
  tapeDelay: Disc3,
  paulstretch: Music4,
  silenceRemover: Scissors,
  noiseGenerator: Waves,
  denoise: Eraser,
  centerCut: CircleSlash,
  wahwah: AudioLines,
};

/**
 * SoundLab's "Apply Effects to selected range" sheet: a two column grid of
 * every range effect, icon on the left, in the same order. Picking one opens
 * its dialog; the sheet stays half height like the original.
 */
export function RangeEffectsSheet({ visible, onClose, onPick, rangeLabel }: Props) {
  const { t } = useTranslation('projects');
  const rows = useMemo(() => {
    const out: EffectDef[][] = [];
    for (let i = 0; i < EFFECTS.length; i += 2) out.push(EFFECTS.slice(i, i + 2));
    return out;
  }, []);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('studio.effects.title')}
      detents={[0.72, 0.95]}
      scrollable
    >
      <ScrollView
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
      >
        <Text variant="caption" style={styles.subtitle}>
          {t('studio.effects.subtitle', { range: rangeLabel })}
        </Text>
        <View style={styles.notice}>
          <Text variant="caption" style={styles.noticeText}>
            {t('studio.effects.inDevelopment')}
          </Text>
        </View>
        {rows.map((row, r) => (
          <View key={r} style={styles.row}>
            {row.map((def) => {
              const Icon = ICONS[def.id] ?? Activity;
              const locked = !ENABLED_EFFECTS.has(def.id);
              return (
                <Pressable
                  key={def.id}
                  disabled={locked}
                  onPress={() => {
                    void haptic('light');
                    onPick(def);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={def.name}
                  accessibilityState={{ disabled: locked }}
                  style={({ pressed }) => [
                    styles.cell,
                    locked && styles.cellLocked,
                    pressed && styles.pressed,
                  ]}
                >
                  <Icon size={18} color={STUDIO_COLORS.text} strokeWidth={2} />
                  <Text variant="small" numberOfLines={1} style={styles.cellLabel}>
                    {def.name}
                  </Text>
                  {def.pro && (
                    <View style={styles.pro}>
                      <Text variant="caption" style={styles.proText}>
                        AI
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
            {row.length === 1 && <View style={[styles.cell, styles.cellGhost]} />}
          </View>
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  grid: {
    paddingHorizontal: 8,
    paddingBottom: 28,
  },
  subtitle: {
    color: STUDIO_COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  cell: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    backgroundColor: STUDIO_COLORS.surfaceRaised,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  cellLocked: {
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
  cellGhost: {
    backgroundColor: 'transparent',
  },
  cellLabel: {
    color: STUDIO_COLORS.text,
    flex: 1,
    marginLeft: 8,
  },
  pro: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: STUDIO_COLORS.primary,
  },
  proText: {
    color: STUDIO_COLORS.onPrimary,
    fontSize: 9,
    fontFamily: 'Archivo_700Bold',
  },
  pressed: {
    opacity: 0.7,
  },
});
