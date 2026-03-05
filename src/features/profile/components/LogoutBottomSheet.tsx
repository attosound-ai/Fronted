import { View, StyleSheet, TouchableOpacity } from 'react-native';
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
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Log Out">
      <View style={styles.content}>
        <Text variant="body" style={styles.message}>
          Are you sure you want to log out? You'll need to sign in again to access your
          account.
        </Text>

        <Button
          title="Log Out"
          onPress={onConfirm}
          loading={isLoading}
          style={styles.logoutButton}
        />

        <TouchableOpacity
          onPress={onClose}
          activeOpacity={0.7}
          style={styles.cancelButton}
        >
          <Text style={styles.cancelText}>Cancel</Text>
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
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 14,
  },
});
