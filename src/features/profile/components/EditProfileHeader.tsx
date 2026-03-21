import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';

interface EditProfileHeaderProps {
  onSave: () => void;
  isSubmitting: boolean;
}

export function EditProfileHeader({ onSave, isSubmitting }: EditProfileHeaderProps) {
  const { t } = useTranslation('profile');

  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()} hitSlop={8} activeOpacity={0.6}>
        <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
      </TouchableOpacity>
      <Text variant="h2" style={styles.headerTitle}>
        {t('edit.headerTitle')}
      </Text>
      <TouchableOpacity
        onPress={onSave}
        disabled={isSubmitting}
        hitSlop={8}
        activeOpacity={0.6}
      >
        <Text style={[styles.saveText, isSubmitting && styles.saveTextDisabled]}>
          {t('edit.saveButton')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#222222',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#FFFFFF',
  },
  saveText: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 14,
  },
  saveTextDisabled: {
    opacity: 0.5,
  },
});
