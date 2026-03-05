import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';

export function EmptyProjectsState() {
  return (
    <View style={styles.container}>
      <Ionicons name="folder-open-outline" size={64} color="#333" />
      <Text variant="h3" style={styles.title}>
        No projects yet
      </Text>
      <Text variant="body" style={styles.subtitle}>
        Create your first project to start organizing your recordings
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  title: {
    color: '#FFF',
    marginTop: 8,
  },
  subtitle: {
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
});
