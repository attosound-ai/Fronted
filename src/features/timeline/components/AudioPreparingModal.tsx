import { View, Modal, StyleSheet, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';

export type AudioPreparingMode = 'recording' | 'import';

interface AudioPreparingModalProps {
  visible: boolean;
  /** Picks the i18n strings shown to the user. */
  mode: AudioPreparingMode;
}

/**
 * Blocking loading modal shown right after the user finishes a recording
 * or picks a file from the system, while the audio is being uploaded
 * and attached to the project. The upload usually takes 1–3 seconds and
 * without explicit feedback the timeline appears frozen.
 *
 * Same visual treatment for both modes — only the copy changes — so the
 * user perceives a single consistent "preparing audio" state.
 */
export function AudioPreparingModal({ visible, mode }: AudioPreparingModalProps) {
  const { t } = useTranslation('projects');

  const title =
    mode === 'recording'
      ? t('timeline.preparingRecordingTitle')
      : t('timeline.preparingImportTitle');
  const subtitle =
    mode === 'recording'
      ? t('timeline.preparingRecordingSubtitle')
      : t('timeline.preparingImportSubtitle');

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text variant="body" style={styles.title}>
            {title}
          </Text>
          <Text variant="caption" style={styles.subtitle}>
            {subtitle}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 32,
    alignItems: 'center',
    gap: 14,
    maxWidth: 320,
    minWidth: 260,
  },
  title: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 16,
    textAlign: 'center',
  },
  subtitle: {
    color: '#888888',
    fontFamily: 'Archivo_400Regular',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
  },
});
