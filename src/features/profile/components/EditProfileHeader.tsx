import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
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
        <ArrowLeft size={24} color="#FFFFFF" strokeWidth={2.25} />
      </TouchableOpacity>
      <Text
        variant="h2"
        style={styles.headerTitle}
        numberOfLines={1}
        maxFontSizeMultiplier={1.1}
      >
        {t('edit.headerTitle')}
      </Text>
      <TouchableOpacity
        onPress={onSave}
        disabled={isSubmitting}
        hitSlop={8}
        activeOpacity={0.6}
      >
        {isSubmitting ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Text style={styles.saveText} numberOfLines={1} maxFontSizeMultiplier={1.1}>
            {t('edit.saveButton')}
          </Text>
        )}
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
