import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import NativeSlider from '@react-native-community/slider';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Wrench } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui/Text';
import { haptic } from '@/lib/haptics/hapticService';
import type { LaneMeta } from '../types';
import { clampDb, gainDbToSlider, sliderToGainDb } from '../utils/dbConversion';
import { STUDIO, STUDIO_COLORS } from './studioTheme';

/**
 * The system slider's thumb is 28 pt, which swallows a 110 pt panel. The
 * control is laid out wider and scaled down, so it stays a real UISlider
 * (native gesture, native feel) at a size that fits the track.
 */
const SLIDER_SCALE = 0.68;
const SLIDER_WIDTH = Math.round((STUDIO.panelWidth - 14) / SLIDER_SCALE);

interface Props {
  laneIndex: number;
  /** Prefix the name with the track number (a SoundLab preference). */
  showIndex?: boolean;
  meta: LaneMeta | undefined;
  isActive: boolean;
  onSelect: () => void;
  onOpenMenu: () => void;
  onToggleMute: () => void;
  onToggleSolo: () => void;
  /** `commit` is true on release; false while sliding (live preview only). */
  onGainChange: (gainDb: number, commit: boolean) => void;
  onPanChange: (pan: number, commit: boolean) => void;
}

function formatGain(db: number): string {
  const rounded = Math.round(db);
  return `${rounded > 0 ? '+' : ''}${rounded}dB`;
}

function formatPan(pan: number, left: string, right: string, center: string): string {
  const pct = Math.round(Math.abs(pan) * 100);
  if (pct < 3) return center;
  return `${pan < 0 ? left : right}${pct}%`;
}

/**
 * The left panel of every track, laid out like SoundLab's: name (opens the
 * track menu), gain slider with its value, pan slider with its value, and
 * the Mute, menu, Solo row. Both sliders are the native UISlider.
 */
export const TrackPanel = memo(function TrackPanel({
  laneIndex,
  showIndex = false,
  meta,
  isActive,
  onSelect,
  onOpenMenu,
  onToggleMute,
  onToggleSolo,
  onGainChange,
  onPanChange,
}: Props) {
  const { t } = useTranslation('projects');
  // An empty stored name still means "unnamed", so fall through to the default.
  const rawName = meta?.name || t('studio.trackDefaultName', { n: laneIndex + 1 });
  const name = showIndex ? `${laneIndex + 1}. ${rawName}` : rawName;
  const gainDb = clampDb(meta?.gainDb ?? 0);
  const pan = Math.max(-1, Math.min(1, meta?.pan ?? 0));
  const muted = meta?.muted ?? false;
  const solo = meta?.solo ?? false;
  // The lane colour from the track sheet: a dot by the name and the fader's
  // filled side, so the panel and its clips read as one track.
  const laneColor = meta?.color || null;

  // The slider travels 0..1 with 0 dB in the middle; the track keeps dB.
  const handleGain = useCallback(
    (v: number) => onGainChange(sliderToGainDb(v), false),
    [onGainChange]
  );
  const handleGainEnd = useCallback(
    (v: number) => onGainChange(sliderToGainDb(v), true),
    [onGainChange]
  );
  const handlePan = useCallback((v: number) => onPanChange(v, false), [onPanChange]);
  const handlePanEnd = useCallback((v: number) => onPanChange(v, true), [onPanChange]);

  return (
    <View style={[styles.panel, isActive && styles.panelActive]}>
      <View style={styles.titleRow}>
        <Pressable
          onPress={() => {
            void haptic('light');
            onSelect();
            onOpenMenu();
          }}
          accessibilityRole="button"
          accessibilityLabel={name}
          style={({ pressed }) => [styles.nameButton, pressed && styles.pressed]}
        >
          {laneColor && (
            <View style={[styles.colorDot, { backgroundColor: laneColor }]} />
          )}
          <Text
            variant="small"
            numberOfLines={1}
            style={styles.name}
            maxFontSizeMultiplier={1.0}
          >
            {name}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            void haptic('light');
            onSelect();
            onOpenMenu();
          }}
          accessibilityRole="button"
          accessibilityLabel={t('studio.trackMenu')}
          hitSlop={8}
          style={({ pressed }) => [styles.wrench, pressed && styles.pressed]}
        >
          <Wrench size={14} color={STUDIO_COLORS.text} strokeWidth={2.25} />
        </Pressable>
      </View>

      <GestureDetector gesture={Gesture.Native()}>
        <View style={styles.sliderBlock}>
          <NativeSlider
            style={[styles.slider, styles.sliderScaled]}
            value={gainDbToSlider(gainDb)}
            minimumValue={0}
            maximumValue={1}
            step={0}
            onValueChange={handleGain}
            onSlidingComplete={handleGainEnd}
            minimumTrackTintColor={laneColor ?? STUDIO_COLORS.text}
            maximumTrackTintColor={STUDIO_COLORS.borderStrong}
            thumbTintColor={STUDIO_COLORS.text}
            accessibilityLabel={t('studio.gain')}
          />
          <Text variant="small" style={styles.sliderLabel} maxFontSizeMultiplier={1.0}>
            {t('studio.gainLabel', { value: formatGain(gainDb) })}
          </Text>
        </View>
      </GestureDetector>

      <GestureDetector gesture={Gesture.Native()}>
        <View style={styles.sliderBlock}>
          <NativeSlider
            style={[styles.slider, styles.sliderScaled]}
            value={pan}
            minimumValue={-1}
            maximumValue={1}
            step={0}
            onValueChange={handlePan}
            onSlidingComplete={handlePanEnd}
            minimumTrackTintColor={STUDIO_COLORS.borderStrong}
            maximumTrackTintColor={STUDIO_COLORS.borderStrong}
            thumbTintColor={STUDIO_COLORS.text}
            accessibilityLabel={t('studio.pan')}
          />
          <Text variant="small" style={styles.sliderLabel} maxFontSizeMultiplier={1.0}>
            {t('studio.panLabel', {
              value: formatPan(
                pan,
                t('studio.panLeft'),
                t('studio.panRight'),
                t('studio.panCenter')
              ),
            })}
          </Text>
        </View>
      </GestureDetector>

      <View style={styles.row}>
        <Pressable
          onPress={() => {
            void haptic('light');
            onToggleMute();
          }}
          accessibilityRole="button"
          accessibilityState={{ selected: muted }}
          style={[styles.rowButton, muted && styles.rowButtonActive]}
        >
          <Text
            variant="small"
            style={[styles.rowLabel, muted && styles.rowLabelActive]}
            maxFontSizeMultiplier={1.0}
          >
            {t('studio.mute')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            void haptic('light');
            onToggleSolo();
          }}
          accessibilityRole="button"
          accessibilityState={{ selected: solo }}
          style={[styles.rowButton, solo && styles.rowButtonActive]}
        >
          <Text
            variant="small"
            style={[styles.rowLabel, solo && styles.rowLabelActive]}
            maxFontSizeMultiplier={1.0}
          >
            {t('studio.solo')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  panel: {
    width: STUDIO.panelWidth,
    height: STUDIO.trackHeight,
    backgroundColor: STUDIO_COLORS.surface,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: STUDIO_COLORS.borderStrong,
    paddingTop: 3,
  },
  panelActive: {
    backgroundColor: STUDIO_COLORS.surfaceRaised,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 6,
    paddingRight: 4,
    height: 26,
  },
  nameButton: {
    flex: 1,
    height: 26,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  wrench: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: STUDIO_COLORS.surfaceRaised,
  },
  name: {
    color: STUDIO_COLORS.textMuted,
    fontSize: 12,
  },
  sliderBlock: {
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
  },
  slider: {
    width: SLIDER_WIDTH,
    height: 28,
  },
  sliderScaled: {
    transform: [{ scale: SLIDER_SCALE }],
  },
  sliderLabel: {
    color: STUDIO_COLORS.text,
    fontSize: 11,
    fontFamily: 'Archivo_600SemiBold',
    marginTop: 2,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 5,
    paddingBottom: 4,
    gap: 6,
  },
  rowButton: {
    flex: 1,
    height: 30,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: STUDIO_COLORS.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowButtonActive: {
    backgroundColor: STUDIO_COLORS.primary,
    borderColor: STUDIO_COLORS.primary,
  },
  rowLabel: {
    color: STUDIO_COLORS.text,
    fontSize: 11,
  },
  rowLabelActive: {
    color: STUDIO_COLORS.onPrimary,
  },
  pressed: {
    opacity: 0.7,
  },
});
