import { View, Modal, StyleSheet, ActivityIndicator } from 'react-native';
import { Text } from '@/components/ui/Text';

interface EditorLoadingModalProps {
  visible: boolean;
  progress: number; // 0..1
}

export function EditorLoadingModal({ visible, progress }: EditorLoadingModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text variant="body" style={styles.title}>
            Optimizing your experience...
          </Text>
          <View style={styles.trackBackground}>
            <View style={[styles.trackFill, { width: `${Math.round(progress * 100)}%` }]} />
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
    fontFamily: 'Poppins_500Medium',
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
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
  },
});
