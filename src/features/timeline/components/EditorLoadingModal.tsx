import { View, Modal, StyleSheet, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';

interface EditorLoadingModalProps {
  visible: boolean;
  progress: number; // 0..1
}

export function EditorLoadingModal({ visible, progress }: EditorLoadingModalProps) {
  const { t } = useTranslation('projects');
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text variant="body" style={styles.title}>
            {t('timeline.loadingTitle')}
          </Text>
          <View style={styles.trackBackground}>
            <View
              style={[styles.trackFill, { width: `${Math.round(progress * 100)}%` }]}
            />
          </View>
          <Text variant="caption" style={styles.percent}>
            {Math.round(progress * 100)}%
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    paddingVertical: 32,
    paddingHorizontal: 28,
    alignItems: 'center',
    gap: 16,
    width: '75%',
  },
  title: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_500Medium',
    fontSize: 15,
    textAlign: 'center',
  },
  trackBackground: {
    width: '100%',
    height: 4,
    backgroundColor: '#333333',
    borderRadius: 2,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
  },
  percent: {
    color: '#666666',
    fontFamily: 'Archivo_400Regular',
    fontSize: 12,
  },
});
