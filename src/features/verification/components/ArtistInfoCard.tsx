import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';

interface ArtistInfoCardProps {
  artistName: string;
  email: string;
  onEdit: () => void;
}

/**
 * ArtistInfoCard — Inline row displaying artist name, email and edit action.
 */
export function ArtistInfoCard({ artistName, email, onEdit }: ArtistInfoCardProps) {
  return (
    <View style={styles.container}>
      <View style={styles.info}>
        <Text variant="body" style={styles.name}>
          {artistName}
        </Text>
        <Text variant="caption" style={styles.email}>
          {email}
        </Text>
      </View>
      <TouchableOpacity onPress={onEdit} hitSlop={8} activeOpacity={0.6}>
        <Ionicons name="create-outline" size={18} color="#666" />
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
    fontFamily: 'Poppins_500Medium',
    fontSize: 13,
    lineHeight: 18,
  },
  email: {
    color: '#666',
    fontSize: 11,
    lineHeight: 15,
  },
});
