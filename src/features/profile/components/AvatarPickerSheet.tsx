import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Crop, Image as ImageIcon, Camera } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Text } from '@/components/ui/Text';

interface AvatarPickerSheetProps {
  visible: boolean;
  hasCurrentPhoto: boolean;
  onClose: () => void;
  onEditCurrent: () => void;
  onPickFromGallery: () => void;
  onTakePhoto: () => void;
}

export function AvatarPickerSheet({
  visible,
  hasCurrentPhoto,
  onClose,
  onEditCurrent,
  onPickFromGallery,
  onTakePhoto,
}: AvatarPickerSheetProps) {
  const { t } = useTranslation('profile');

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('edit.avatarSheetTitle')}>
      <View style={styles.content}>
        {hasCurrentPhoto && (
          <TouchableOpacity
            onPress={onEditCurrent}
            activeOpacity={0.7}
            style={styles.option}
          >
            <View style={styles.iconCircle}>
              <Crop size={20} color="#FFFFFF" strokeWidth={2.25} />
            </View>
            <Text
              style={styles.optionText}
              numberOfLines={1}
              maxFontSizeMultiplier={1.15}
            >
              {t('edit.avatarSheetEditCurrent')}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={onPickFromGallery}
          activeOpacity={0.7}
          style={styles.option}
        >
          <View style={styles.iconCircle}>
            <ImageIcon size={20} color="#FFFFFF" strokeWidth={2.25} />
          </View>
          <Text style={styles.optionText} numberOfLines={1} maxFontSizeMultiplier={1.15}>
            {t('edit.avatarSheetFromGallery')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onTakePhoto} activeOpacity={0.7} style={styles.option}>
          <View style={styles.iconCircle}>
            <Camera size={20} color="#FFFFFF" strokeWidth={2.25} />
          </View>
          <Text style={styles.optionText} numberOfLines={1} maxFontSizeMultiplier={1.15}>
            {t('edit.avatarSheetFromCamera')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onClose}
          activeOpacity={0.7}
          style={styles.cancelButton}
        >
          <Text style={styles.cancelText} numberOfLines={1} maxFontSizeMultiplier={1.15}>
            {t('edit.avatarSheetCancel')}
          </Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 4,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#222222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_500Medium',
    fontSize: 15,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
  },
  cancelText: {
    color: '#888888',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 14,
  },
});
