import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Pencil } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';

interface CreatorInfoCardProps {
  creatorName: string;
  email: string;
  onEdit: () => void;
}

/**
 * CreatorInfoCard — Inline row displaying creator name, email and edit action.
 */
export function CreatorInfoCard({ creatorName, email, onEdit }: CreatorInfoCardProps) {
  const { t } = useTranslation('feed');
  return (
    <View style={styles.container}>
      <View style={styles.info}>
        <Text variant="body" style={styles.name}>
          {creatorName}
        </Text>
        <Text variant="caption" style={styles.email}>
          {email}
        </Text>
      </View>
      <TouchableOpacity onPress={onEdit} hitSlop={8} activeOpacity={0.6}>
        <Pencil size={18} color="#666" strokeWidth={2.25} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  info: {
    flex: 1,
    gap: 1,
  },
  name: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_500Medium',
    fontSize: 13,
    lineHeight: 18,
  },
  email: {
    color: '#666',
    fontSize: 11,
    lineHeight: 15,
  },
});
