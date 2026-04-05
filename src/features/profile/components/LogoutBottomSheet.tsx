import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';

interface LogoutBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
}

export function LogoutBottomSheet({
  visible,
  onClose,
  onConfirm,
  isLoading,
}: LogoutBottomSheetProps) {
  const { t } = useTranslation('profile');

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('logout.sheetTitle')}>
      <View style={styles.content}>
        <Text variant="body" style={styles.message}>
          {t('logout.message')}
        </Text>

        <Button
          title={t('logout.confirmButton')}
          onPress={onConfirm}
          loading={isLoading}
          style={styles.logoutButton}
        />

        <TouchableOpacity
          onPress={onClose}
          activeOpacity={0.7}
          style={styles.cancelButton}
        >
          <Text style={styles.cancelText}>{t('logout.cancelButton')}</Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
  },
  message: {
    color: '#888888',
    textAlign: 'center',
    lineHeight: 22,
  },
  logoutButton: {
    backgroundColor: '#EF4444',
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  cancelText: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 14,
  },
});
