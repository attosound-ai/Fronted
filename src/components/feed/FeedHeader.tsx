import { useState } from 'react';
import { View, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ComingSoonModal } from '@/components/ui/ComingSoonModal';
import { CreateActionSheet } from './CreateActionSheet';

const ATTO_LOGO_URI =
  'https://res.cloudinary.com/dxzcutnlp/image/upload/v1771017624/Property_1_Variant4_vq9shb.png';

export function FeedHeader() {
  const [comingSoonVisible, setComingSoonVisible] = useState(false);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);

  const showComingSoon = () => setComingSoonVisible(true);

  return (
    <View style={styles.container}>
      <View style={styles.leftIcons}>
        <TouchableOpacity onPress={() => setActionSheetVisible(true)} style={styles.iconButton}>
          <Ionicons name="add" size={28} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity onPress={showComingSoon} style={styles.iconButton}>
          <Ionicons name="bag-outline" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>

      <Image source={{ uri: ATTO_LOGO_URI }} style={styles.logo} resizeMode="contain" />

      <View style={styles.rightIcons}>
        <TouchableOpacity onPress={showComingSoon} style={styles.iconButton}>
          <Ionicons name="information-circle-outline" size={26} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity onPress={showComingSoon} style={styles.iconButton}>
          <Ionicons name="notifications-outline" size={26} color="#FFF" />
        </TouchableOpacity>
      </View>

      <ComingSoonModal
        visible={comingSoonVisible}
        onClose={() => setComingSoonVisible(false)}
      />
      <CreateActionSheet
        visible={actionSheetVisible}
        onClose={() => setActionSheetVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#000',
  },
  leftIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: 90,
  },
  logo: {
    width: 100,
    height: 28,
  },
  rightIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    width: 90,
  },
  iconButton: {
    padding: 6,
  },
});
