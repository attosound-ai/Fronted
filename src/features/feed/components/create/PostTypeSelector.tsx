import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import type { PostType } from '@/types/post';

interface PostTypeSelectorProps {
  selected: PostType | null;
  onSelect: (type: PostType) => void;
}

export function PostTypeSelector({ selected, onSelect }: PostTypeSelectorProps) {
  const { t } = useTranslation('feed');

  const POST_TYPES: {
    type: PostType;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
  }[] = [
    { type: 'image', label: t('create.typePhoto'), icon: 'image-outline' },
    { type: 'audio', label: t('create.typeSong'), icon: 'musical-notes-outline' },
    { type: 'video', label: t('create.typeVideo'), icon: 'videocam-outline' },
    { type: 'reel', label: t('create.typeReel'), icon: 'phone-portrait-outline' },
    { type: 'text', label: t('create.typePoem'), icon: 'document-text-outline' },
  ];

  return (
    <View style={styles.container}>
      <Text variant="h2" style={styles.title}>
        {t('create.typeSelectorTitle')}
      </Text>
      <View style={styles.grid}>
        {POST_TYPES.map((item) => {
          const isSelected = selected === item.type;
          return (
            <TouchableOpacity
              key={item.type}
              style={[styles.option, isSelected && styles.optionSelected]}
              onPress={() => onSelect(item.type)}
              activeOpacity={0.7}
            >
              <Ionicons name={item.icon} size={32} color={isSelected ? '#FFF' : '#888'} />
              <Text
                variant="caption"
                style={[styles.label, isSelected && styles.labelSelected]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  title: {
    textAlign: 'center',
    marginBottom: 24,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
  },
  option: {
    width: 90,
    height: 90,
    borderRadius: 16,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionSelected: {
    borderColor: '#FFF',
    backgroundColor: '#222',
  },
  label: {
    color: '#888',
    fontSize: 12,
  },
  labelSelected: {
    color: '#FFF',
  },
});
