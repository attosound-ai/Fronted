import { Modal, View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Text } from './Text';

interface ComingSoonModalProps {
  visible: boolean;
  onClose: () => void;
}

export function ComingSoonModal({ visible, onClose }: ComingSoonModalProps) {
  const { t } = useTranslation('common');
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#888" />
          </TouchableOpacity>

          <Ionicons
            name="construct-outline"
            size={56}
            color="#3B82F6"
            style={styles.icon}
          />

          <Text variant="h2" style={styles.title}>
            {t('comingSoon.title')}
          </Text>

          <Text variant="body" style={styles.description}>
            {t('comingSoon.description')}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  card: {
    backgroundColor: '#111',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#222',
    paddingHorizontal: 32,
    paddingTop: 48,
    paddingBottom: 36,
    alignItems: 'center',
    width: '100%',
  },
  closeButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    padding: 4,
  },
  icon: {
    marginBottom: 20,
  },
  title: {
    color: '#FFF',
    marginBottom: 10,
    textAlign: 'center',
  },
  description: {
    color: '#888',
    textAlign: 'center',
    lineHeight: 22,
  },
});
