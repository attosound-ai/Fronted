import { Modal, View, TouchableOpacity, StyleSheet } from 'react-native';
import { X, Wrench } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from './Text';

interface ComingSoonModalProps {
  visible: boolean;
  onClose: () => void;
  icon?: LucideIcon;
  title?: string;
  description?: string;
}

export function ComingSoonModal({
  visible,
  onClose,
  icon: Icon = Wrench,
  title,
  description,
}: ComingSoonModalProps) {
  const { t } = useTranslation('common');
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <X size={24} color="#888" strokeWidth={2.25} />
          </TouchableOpacity>

          <Icon size={56} color="#FFF" strokeWidth={2.25} style={styles.icon} />

          <Text variant="h2" style={styles.title}>
            {title ?? t('comingSoon.title')}
          </Text>

          <Text variant="body" style={styles.description}>
            {description ?? t('comingSoon.description')}
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
