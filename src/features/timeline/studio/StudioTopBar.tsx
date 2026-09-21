import { StyleSheet, View } from 'react-native';
import { X, Plus, Trash2, Settings, Share } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { StudioIconButton } from './StudioButton';
import { STUDIO, STUDIO_COLORS } from './studioTheme';

interface Props {
  onClose: () => void;
  onAddTrack: () => void;
  onRemoveTrack: () => void;
  canRemoveTrack: boolean;
  onConfig: () => void;
  onShare: () => void;
  canShare: boolean;
}

/** SoundLab's top bar: close on the left, track add and remove in the middle,
 *  config and share on the right. Share is the bar's primary action. */
export function StudioTopBar({
  onClose,
  onAddTrack,
  onRemoveTrack,
  canRemoveTrack,
  onConfig,
  onShare,
  canShare,
}: Props) {
  const { t } = useTranslation('projects');
  const icon = (Icon: typeof X, color: string = STUDIO_COLORS.text) => (
    <Icon size={20} color={color} strokeWidth={2.25} />
  );
  return (
    <View style={styles.bar}>
      <StudioIconButton
        icon={icon(X)}
        onPress={onClose}
        accessibilityLabel={t('studio.saveAndClose')}
      />
      <View style={styles.center}>
        <StudioIconButton
          icon={icon(Plus)}
          onPress={onAddTrack}
          accessibilityLabel={t('studio.addTrack')}
        />
        <StudioIconButton
          icon={icon(Trash2)}
          onPress={onRemoveTrack}
          disabled={!canRemoveTrack}
          accessibilityLabel={t('studio.removeTrack')}
        />
      </View>
      <View style={styles.right}>
        <StudioIconButton
          icon={icon(Settings)}
          onPress={onConfig}
          accessibilityLabel={t('studio.config')}
        />
        <StudioIconButton
          icon={icon(Share, STUDIO_COLORS.onPrimary)}
          onPress={onShare}
          disabled={!canShare}
          primary
          accessibilityLabel={t('studio.share')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: STUDIO.topBarHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
  },
  center: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  right: {
    flexDirection: 'row',
    gap: 12,
  },
});
