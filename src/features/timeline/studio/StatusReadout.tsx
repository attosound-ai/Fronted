import { StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';

import { Text } from '@/components/ui/Text';
import { STUDIO, STUDIO_COLORS } from './studioTheme';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

interface Props {
  /** Selection start and end in ms, or null when nothing is selected. */
  selectionStartMs: number | null;
  selectionEndMs: number | null;
  /** Live playhead position, updated on the UI thread. */
  positionSv: SharedValue<number>;
}

/** hh:mm:ss.d, the format SoundLab shows in its readout. Worklet safe. */
export function formatReadout(ms: number): string {
  'worklet';
  const safe = Math.max(0, ms);
  const totalSeconds = Math.floor(safe / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const tenth = Math.floor((safe % 1000) / 100);
  const h = hours < 10 ? `0${hours}` : `${hours}`;
  const m = minutes < 10 ? `0${minutes}` : `${minutes}`;
  const s = seconds < 10 ? `0${seconds}` : `${seconds}`;
  return `${h}:${m}:${s}.${tenth}`;
}

/**
 * The bottom readout of the editor, one rounded strip like SoundLab's:
 * "Start", "End" and "Play Head" when there is a selection, "No Selection"
 * plus the play head otherwise. The play head is driven from the shared
 * value so it never touches the JS thread while playing.
 */
export function StatusReadout({ selectionStartMs, selectionEndMs, positionSv }: Props) {
  const { t } = useTranslation('projects');
  const animatedProps = useAnimatedProps(() => ({
    text: formatReadout(positionSv.value),
    defaultValue: formatReadout(positionSv.value),
  }));
  const hasSelection = selectionStartMs !== null && selectionEndMs !== null;

  return (
    <View style={styles.row}>
      <View style={styles.strip}>
        {hasSelection ? (
          <>
            <Text variant="small" style={styles.label} maxFontSizeMultiplier={1.0}>
              {t('studio.readoutStart')}
            </Text>
            <Text variant="small" style={styles.value} maxFontSizeMultiplier={1.0}>
              {formatReadout(selectionStartMs)}
            </Text>
            <Text variant="small" style={styles.label} maxFontSizeMultiplier={1.0}>
              {t('studio.readoutEnd')}
            </Text>
            <Text variant="small" style={styles.value} maxFontSizeMultiplier={1.0}>
              {formatReadout(selectionEndMs)}
            </Text>
          </>
        ) : (
          <Text variant="small" style={styles.label} maxFontSizeMultiplier={1.0}>
            {t('studio.noSelection')}
          </Text>
        )}
        <Text variant="small" style={styles.label} maxFontSizeMultiplier={1.0}>
          {t('studio.readoutPlayHead')}
        </Text>
        <AnimatedTextInput
          animatedProps={animatedProps}
          editable={false}
          underlineColorAndroid="transparent"
          style={[styles.value, styles.live]}
          pointerEvents="none"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: STUDIO.readoutHeight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: STUDIO_COLORS.background,
  },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 24,
    borderRadius: 6,
    paddingHorizontal: 10,
    backgroundColor: STUDIO_COLORS.surfaceRaised,
    alignSelf: 'stretch',
  },
  label: {
    color: STUDIO_COLORS.textMuted,
    fontSize: 11,
    marginRight: 4,
    marginLeft: 8,
  },
  value: {
    color: STUDIO_COLORS.text,
    fontSize: 11,
    fontFamily: 'Archivo_600SemiBold',
    padding: 0,
  },
  live: {
    minWidth: 66,
  },
});
