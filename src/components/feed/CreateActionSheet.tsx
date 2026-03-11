import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Text } from '@/components/ui/Text';

interface CreateActionSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function CreateActionSheet({ visible, onClose }: CreateActionSheetProps) {
  const { t } = useTranslation('feed');
  const handleProjects = () => {
    onClose();
    router.push('/(tabs)/projects');
  };

  const handleUploadPost = () => {
    onClose();
    router.push('/create-post');
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('header.createSheetTitle')}>
      {/* Projects option */}
      <Pressable style={styles.option} onPress={handleProjects}>
        <View style={styles.iconCircle}>
          <Ionicons name="folder-outline" size={22} color="#FFF" />
        </View>
        <View style={styles.textContainer}>
          <Text variant="body" style={styles.optionTitle}>
            {t('header.createOptionProjectsTitle')}
          </Text>
          <Text variant="caption" style={styles.optionSubtitle}>
            {t('header.createOptionProjectsSubtitle')}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#555" />
      </Pressable>

      {/* Upload Post option */}
      <Pressable style={styles.option} onPress={handleUploadPost}>
        <View style={styles.iconCircle}>
          <Ionicons name="cloud-upload-outline" size={22} color="#FFF" />
        </View>
        <View style={styles.textContainer}>
          <Text variant="body" style={styles.optionTitle}>
            {t('header.createOptionUploadTitle')}
          </Text>
          <Text variant="caption" style={styles.optionSubtitle}>
            {t('header.createOptionUploadSubtitle')}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#555" />
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
    marginLeft: 14,
  },
  optionTitle: {
    color: '#FFF',
    fontSize: 15,
    fontFamily: 'Archivo_500Medium',
  },
  optionSubtitle: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
});
