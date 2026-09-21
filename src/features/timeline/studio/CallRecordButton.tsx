import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui/Text';
import { haptic } from '@/lib/haptics/hapticService';
import { STUDIO, STUDIO_COLORS } from './studioTheme';

interface Props {
  isRecording: boolean;
  elapsed: string;
  onPress: () => void;
  disabled?: boolean;
}

/**
 * The record the call button, kept from the old toolbar: a red dot that
 * turns into a square while the take runs, with the elapsed time beside
 * it. Sits in the transport's recorder slot during a call.
 */
export function CallRecordButton({
  isRecording,
  elapsed,
  onPress,
  disabled = false,
}: Props) {
  const { t } = useTranslation('projects');
  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        void haptic(isRecording ? 'medium' : 'heavy');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={
        isRecording
          ? t('timeline.toolStopRecording', { elapsed })
          : t('timeline.toolRecord')
      }
      accessibilityState={{ disabled, selected: isRecording }}
      style={({ pressed }) => [
        styles.button,
        isRecording && styles.buttonRecording,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <View style={[styles.dot, isRecording && styles.square]} />
      {isRecording && (
        <Text variant="small" style={styles.elapsed} maxFontSizeMultiplier={1.0}>
          {elapsed}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: STUDIO.iconButton,
    minWidth: STUDIO.iconButton,
    borderRadius: STUDIO.iconButton / 2,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: STUDIO_COLORS.record,
  },
  buttonRecording: {
    backgroundColor: 'rgba(255,59,48,0.18)',
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: STUDIO_COLORS.record,
  },
  square: {
    borderRadius: 3,
  },
  elapsed: {
    color: STUDIO_COLORS.text,
    marginLeft: 8,
    fontFamily: 'Archivo_600SemiBold',
    fontVariant: ['tabular-nums'],
  },
  disabled: {
    opacity: 0.35,
  },
  pressed: {
    opacity: 0.7,
  },
});
