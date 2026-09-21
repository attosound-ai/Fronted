import type { RefObject, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Mic,
  Pause,
  Play,
  Redo2,
  Repeat,
  SlidersHorizontal,
  Undo2,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import type { SharedValue } from 'react-native-reanimated';

import { StudioIconButton } from './StudioButton';
import { LevelMeter } from './LevelMeter';
import { STUDIO, STUDIO_COLORS } from './studioTheme';

interface Props {
  isPlaying: boolean;
  canPlay: boolean;
  onTogglePlay: () => void;
  leftLevelSv: SharedValue<number>;
  rightLevelSv: SharedValue<number>;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /**
   * The record slot. In a project it is the inline recorder (mic); during a
   * call the caller passes its own record the call button so that flow
   * stays exactly as it is.
   */
  recordSlot?: ReactNode;
  onRecord?: () => void;
  recording?: boolean;
  loopActive: boolean;
  onToggleLoop: () => void;
  onMasterEffects: () => void;
  /** Measured by the tips overlay to frame Undo and Redo. */
  undoRedoRef?: RefObject<View | null>;
}

/**
 * SoundLab's transport, left to right: big Play, L and R meters, Undo,
 * Redo, recorder, Loop, Master Effects.
 */
export function TransportBar({
  isPlaying,
  canPlay,
  onTogglePlay,
  leftLevelSv,
  rightLevelSv,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  recordSlot,
  onRecord,
  recording = false,
  loopActive,
  onToggleLoop,
  onMasterEffects,
  undoRedoRef,
}: Props) {
  const { t } = useTranslation('projects');
  return (
    <View style={styles.row}>
      <StudioIconButton
        primary
        size={STUDIO.playButton}
        icon={
          isPlaying ? (
            <Pause
              size={22}
              color={STUDIO_COLORS.onPrimary}
              fill={STUDIO_COLORS.onPrimary}
            />
          ) : (
            <Play
              size={22}
              color={STUDIO_COLORS.onPrimary}
              fill={STUDIO_COLORS.onPrimary}
              style={styles.playIcon}
            />
          )
        }
        onPress={onTogglePlay}
        disabled={!canPlay}
        accessibilityLabel={isPlaying ? t('studio.pause') : t('studio.play')}
      />
      <View style={styles.meter}>
        <LevelMeter leftSv={leftLevelSv} rightSv={rightLevelSv} />
      </View>
      <View style={styles.spacer} />
      <View ref={undoRedoRef} collapsable={false} style={styles.pair}>
        <StudioIconButton
          icon={<Undo2 size={18} color={STUDIO_COLORS.text} strokeWidth={2.25} />}
          onPress={onUndo}
          disabled={!canUndo}
          accessibilityLabel={t('studio.undo')}
        />
        <StudioIconButton
          icon={<Redo2 size={18} color={STUDIO_COLORS.text} strokeWidth={2.25} />}
          onPress={onRedo}
          disabled={!canRedo}
          accessibilityLabel={t('studio.redo')}
          style={styles.gap}
        />
      </View>
      <View style={styles.spacer} />
      {recordSlot ?? (
        <StudioIconButton
          icon={
            <Mic
              size={18}
              color={recording ? STUDIO_COLORS.record : STUDIO_COLORS.text}
              strokeWidth={2.25}
            />
          }
          onPress={onRecord ?? (() => {})}
          active={recording}
          accessibilityLabel={t('studio.recordButton')}
        />
      )}
      <StudioIconButton
        icon={
          <Repeat
            size={18}
            color={loopActive ? STUDIO_COLORS.onPrimary : STUDIO_COLORS.text}
            strokeWidth={2.25}
          />
        }
        onPress={onToggleLoop}
        active={loopActive}
        primary={loopActive}
        accessibilityLabel={t('studio.loop')}
        style={styles.gap}
      />
      <StudioIconButton
        icon={
          <SlidersHorizontal size={18} color={STUDIO_COLORS.text} strokeWidth={2.25} />
        }
        onPress={onMasterEffects}
        accessibilityLabel={t('studio.masterEffects')}
        style={styles.gap}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: STUDIO.transportHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    backgroundColor: STUDIO_COLORS.background,
  },
  playIcon: {
    marginLeft: 3,
  },
  meter: {
    marginLeft: 10,
  },
  spacer: {
    flex: 1,
  },
  gap: {
    marginLeft: 8,
  },
  pair: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
