import { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ComingSoonModal } from '@/components/ui/ComingSoonModal';
import { Text } from '@/components/ui/Text';

interface CreateActionSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function CreateActionSheet({ visible, onClose }: CreateActionSheetProps) {
  const [comingSoonVisible, setComingSoonVisible] = useState(false);

  const handleProjects = () => {
    onClose();
    router.push('/(tabs)/projects');
  };

  const handleUploadPost = () => {
    setComingSoonVisible(true);
  };

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose} title="Create">
        {/* Projects option */}
        <Pressable style={styles.option} onPress={handleProjects}>
          <View style={styles.iconCircle}>
            <Ionicons name="folder-outline" size={22} color="#FFF" />
          </View>
          <View style={styles.textContainer}>
            <Text variant="body" style={styles.optionTitle}>
              Projects
            </Text>
            <Text variant="caption" style={styles.optionSubtitle}>
              Open your audio projects
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
              Upload Post
            </Text>
            <Text variant="caption" style={styles.optionSubtitle}>
              Share with your audience
            </Text>
          </View>
          <View style={styles.badge}>
            <Text variant="caption" style={styles.badgeText}>
              Coming Soon
            </Text>
          </View>
        </Pressable>
      </BottomSheet>

      <ComingSoonModal
        visible={comingSoonVisible}
        onClose={() => setComingSoonVisible(false)}
      />
    </>
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
    fontFamily: 'Poppins_500Medium',
  },
  optionSubtitle: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  badge: {
    backgroundColor: '#222',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    color: '#888',
    fontSize: 10,
    fontFamily: 'Poppins_500Medium',
  },
});
