import type { RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { StudioPill } from './StudioButton';
import { STUDIO } from './studioTheme';

interface Props {
  hasRange: boolean;
  canPaste: boolean;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onEffect: () => void;
  onRemove: () => void;
  onSilence: () => void;
  onTrim: () => void;
  /** Measured by the tips overlay to frame the Effect button. */
  effectRef?: RefObject<View | null>;
}

/** SoundLab's range row: Copy, Cut, Paste, Effect, Remove, Silence, Trim.
 *  Effect stays highlighted (active) as the row's hero, like the original. */
export function RangeActionsBar({
  hasRange,
  canPaste,
  onCopy,
  onCut,
  onPaste,
  onEffect,
  onRemove,
  onSilence,
  onTrim,
  effectRef,
}: Props) {
  const { t } = useTranslation('projects');
  const needsRange = t('studio.why.needsRange');
  return (
    <View style={styles.bar}>
      <StudioPill
        label={t('studio.copy')}
        onPress={onCopy}
        disabled={!hasRange}
        disabledReason={needsRange}
        style={styles.pill}
      />
      <StudioPill
        label={t('studio.cut')}
        onPress={onCut}
        disabled={!hasRange}
        disabledReason={needsRange}
        style={styles.pill}
      />
      <StudioPill
        label={t('studio.paste')}
        onPress={onPaste}
        disabled={!canPaste}
        disabledReason={t('studio.why.nothingToPaste')}
        style={styles.pill}
      />
      <View ref={effectRef} collapsable={false} style={[styles.pill, styles.effect]}>
        <StudioPill
          label={t('studio.effect')}
          onPress={onEffect}
          disabled={!hasRange}
          disabledReason={needsRange}
          active={hasRange}
          style={styles.fill}
        />
      </View>
      <StudioPill
        label={t('studio.remove')}
        onPress={onRemove}
        disabled={!hasRange}
        disabledReason={needsRange}
        style={styles.pill}
      />
      <StudioPill
        label={t('studio.silence')}
        onPress={onSilence}
        disabled={!hasRange}
        disabledReason={needsRange}
        style={styles.pill}
      />
      <StudioPill
        label={t('studio.trim')}
        onPress={onTrim}
        disabled={!hasRange}
        disabledReason={needsRange}
        style={styles.pill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    minWidth: 0,
    paddingHorizontal: 4,
    height: 38,
    borderRadius: 19,
  },
  bar: {
    height: STUDIO.rangeBarHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    gap: 4,
  },
  pill: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 2,
  },
  effect: {
    flex: 1.2,
    paddingHorizontal: 0,
  },
});
