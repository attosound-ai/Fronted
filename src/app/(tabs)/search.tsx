import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';

/**
 * SearchScreen - Pantalla de búsqueda/explorar
 */
export default function SearchScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.content}>
        <Text variant="h1">Explorar</Text>
        <Text variant="body" style={styles.subtitle}>
          Descubre contenido nuevo
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  subtitle: {
    color: '#888888',
    marginTop: 8,
  },
});
