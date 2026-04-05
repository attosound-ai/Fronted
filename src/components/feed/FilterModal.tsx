import { View, Switch, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Type, ImageIcon, Video, Clapperboard, Music } from 'lucide-react-native';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Text } from '@/components/ui/Text';
import { CreatorBadge } from '@/components/ui/CreatorBadge';
import { useFeedFilterStore } from '@/stores/feedFilterStore';
import type { PostType } from '@/types/post';

const CONTENT_TYPE_OPTIONS: { type: PostType; labelKey: string; Icon: typeof Type }[] = [
  { type: 'text', labelKey: 'filters.typeText', Icon: Type },
  { type: 'image', labelKey: 'filters.typePhoto', Icon: ImageIcon },
  { type: 'video', labelKey: 'filters.typeVideo', Icon: Video },
  { type: 'reel', labelKey: 'filters.typeReel', Icon: Clapperboard },
  { type: 'audio', labelKey: 'filters.typeAudio', Icon: Music },
];

interface FilterModalProps {
  visible: boolean;
  onClose: () => void;
}

export function FilterModal({ visible, onClose }: FilterModalProps) {
  const { t } = useTranslation('feed');
  const filters = useFeedFilterStore((s) => s.filters);
  const setFilter = useFeedFilterStore((s) => s.setFilter);
  const toggleContentType = useFeedFilterStore((s) => s.toggleContentType);

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('filters.title')}>
      {/* Creators only toggle */}
      <View style={styles.row}>
        <View style={styles.labelRow}>
          <CreatorBadge size="sm" />
          <View style={styles.textCol}>
            <Text variant="body" style={styles.label}>
              {t('filters.creatorsOnly')}
            </Text>
            <Text variant="small" style={styles.description}>
              {t('filters.creatorsOnlyDescription')}
            </Text>
          </View>
        </View>
        <Switch
          value={filters.creatorsOnly}
          onValueChange={(v) => setFilter('creatorsOnly', v)}
          trackColor={{ false: '#333', true: '#F59E0B' }}
          thumbColor="#FFF"
        />
      </View>

      {/* Content type chips */}
      <View style={styles.section}>
        <Text variant="body" style={styles.sectionLabel}>
          {t('filters.contentType')}
        </Text>
        <Text variant="small" style={styles.description}>
          {t('filters.contentTypeDescription')}
        </Text>
        <View style={styles.chipRow}>
          {CONTENT_TYPE_OPTIONS.map(({ type, labelKey, Icon }) => {
            const selected = filters.contentTypes.includes(type);
            return (
              <TouchableOpacity
                key={type}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => toggleContentType(type)}
                activeOpacity={0.7}
              >
                <Icon size={16} color={selected ? '#000' : '#FFF'} strokeWidth={2.25} />
                <Text
                  variant="small"
                  style={[styles.chipText, selected && styles.chipTextSelected]}
                >
                  {t(labelKey)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  label: {
    color: '#FFF',
    fontFamily: 'Archivo_500Medium',
  },
  description: {
    color: '#888',
  },
  section: {
    marginTop: 20,
    gap: 6,
  },
  sectionLabel: {
    color: '#FFF',
    fontFamily: 'Archivo_500Medium',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: 'transparent',
  },
  chipSelected: {
    backgroundColor: '#FFF',
    borderColor: '#FFF',
  },
  chipText: {
    color: '#FFF',
    fontFamily: 'Archivo_500Medium',
  },
  chipTextSelected: {
    color: '#000',
  },
});
