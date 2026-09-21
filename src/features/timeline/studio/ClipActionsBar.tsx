import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { StudioPill } from './StudioButton';
import { STUDIO } from './studioTheme';

interface Props {
  /** With a range the first button reads Replace, without one Insert. */
  hasRange: boolean;
  onInsertOrReplace: () => void;
  canInsertOrReplace: boolean;
  onSplitNew: () => void;
  canSplitNew: boolean;
  onSplit: () => void;
  canSplit: boolean;
  onJoin: () => void;
  canJoin: boolean;
  onDuplicate: () => void;
  canDuplicate: boolean;
}

/** SoundLab's second row: five equal pills that act on clips. */
export function ClipActionsBar({
  hasRange,
  onInsertOrReplace,
  canInsertOrReplace,
  onSplitNew,
  canSplitNew,
  onSplit,
  canSplit,
  onJoin,
  canJoin,
  onDuplicate,
  canDuplicate,
}: Props) {
  const { t } = useTranslation('projects');
  return (
    <View style={styles.bar}>
      <StudioPill
        label={hasRange ? t('studio.replace') : t('studio.insert')}
        onPress={onInsertOrReplace}
        disabled={!canInsertOrReplace}
        style={styles.pill}
      />
      <StudioPill
        label={t('studio.splitNew')}
        onPress={onSplitNew}
        disabled={!canSplitNew}
        style={styles.pill}
      />
      <StudioPill
        label={t('studio.split')}
        onPress={onSplit}
        disabled={!canSplit}
        style={styles.pill}
      />
      <StudioPill
        label={t('studio.join')}
        onPress={onJoin}
        disabled={!canJoin}
        style={styles.pill}
      />
      <StudioPill
        label={t('studio.duplicate')}
        onPress={onDuplicate}
        disabled={!canDuplicate}
        style={styles.pill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: STUDIO.clipBarHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 6,
  },
  pill: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 6,
  },
});
