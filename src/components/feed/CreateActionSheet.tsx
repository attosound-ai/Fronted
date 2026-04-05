import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { PenLine, Music } from 'lucide-react-native';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Text } from '@/components/ui/Text';

interface CreateActionSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function CreateActionSheet({ visible, onClose }: CreateActionSheetProps) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.options}>
        <TouchableOpacity
          style={styles.option}
          activeOpacity={0.7}
          onPress={() => {
            onClose();
            router.push('/create-post');
          }}
        >
          <PenLine size={22} color="#FFFFFF" strokeWidth={2.25} />
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>New Post</Text>
            <Text style={styles.optionSubtitle}>Share with your audience</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.option}
          activeOpacity={0.7}
          onPress={() => {
            onClose();
            router.push('/projects');
          }}
        >
          <Music size={22} color="#FFFFFF" strokeWidth={2.25} />
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Projects</Text>
            <Text style={styles.optionSubtitle}>Record and produce music</Text>
          </View>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  options: {
    gap: 8,
    paddingVertical: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  optionText: {
    flex: 1,
  },
  optionTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Archivo_600SemiBold',
  },
  optionSubtitle: {
    color: '#888888',
    fontSize: 13,
    fontFamily: 'Archivo_400Regular',
    marginTop: 2,
  },
});
