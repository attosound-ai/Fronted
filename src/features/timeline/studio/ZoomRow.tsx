import type { RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import { Minus, Plus, UnfoldHorizontal } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { StudioIconButton, StudioPill } from './StudioButton';
import { STUDIO, STUDIO_COLORS } from './studioTheme';

interface Props {
  automationActive: boolean;
  onToggleAutomation: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  /** Sets the zoom that shows the whole project and scrolls back to its start. */
  onFit: () => void;
  canFit: boolean;
  canZoomOut: boolean;
  canZoomIn: boolean;
  /** Measured by the tips overlay to frame the zoom buttons. */
  zoomRef?: RefObject<View | null>;
}

/**
 * The row under the tracks: the volume automation toggle in the center and
 * the zoom controls on the right, exactly where SoundLab keeps them.
 *
 * Three buttons, not two. Anthony, Sep 28 2026: seeing a whole track or album
 * took so many taps on the minus that it read as impossible, so the first
 * button jumps straight to the zoom where the whole project fits.
 */
export function ZoomRow({
  automationActive,
  onToggleAutomation,
  onZoomOut,
  onZoomIn,
  onFit,
  canFit,
  canZoomOut,
  canZoomIn,
  zoomRef,
}: Props) {
  const { t } = useTranslation('projects');
  return (
    <View style={styles.row}>
      <View style={styles.side} />
      <StudioPill
        label={t('studio.automationButton')}
        active={automationActive}
        onPress={onToggleAutomation}
      />
      <View style={styles.side}>
        <View ref={zoomRef} collapsable={false} style={styles.zoom}>
          <StudioIconButton
            icon={
              <UnfoldHorizontal size={18} color={STUDIO_COLORS.text} strokeWidth={2.25} />
            }
            onPress={onFit}
            disabled={!canFit}
            size={32}
            accessibilityLabel={t('studio.zoomFit')}
            style={styles.zoomFit}
          />
          <StudioIconButton
            icon={<Minus size={18} color={STUDIO_COLORS.text} strokeWidth={2.5} />}
            onPress={onZoomOut}
            disabled={!canZoomOut}
            size={32}
            accessibilityLabel={t('studio.zoomOut')}
          />
          <StudioIconButton
            icon={<Plus size={18} color={STUDIO_COLORS.text} strokeWidth={2.5} />}
            onPress={onZoomIn}
            disabled={!canZoomIn}
            size={32}
            accessibilityLabel={t('studio.zoomIn')}
            style={styles.zoomIn}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: STUDIO.zoomRowHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    backgroundColor: STUDIO_COLORS.background,
  },
  side: {
    flex: 1,
  },
  zoom: {
    flexDirection: 'row',
    alignSelf: 'flex-end',
    alignItems: 'center',
  },
  zoomIn: {
    marginLeft: 8,
  },
  zoomFit: {
    marginRight: 8,
  },
});
