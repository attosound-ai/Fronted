import { useState } from 'react';
import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { ComingSoonModal } from '@/components/ui/ComingSoonModal';
import { CreateActionSheet } from './CreateActionSheet';
import { useAuthStore } from '@/stores/authStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';

const ATTO_LOGO_URI =
  'https://res.cloudinary.com/dxzcutnlp/image/upload/v1771017624/Property_1_Variant4_vq9shb.png';

export function FeedHeader() {
  const user = useAuthStore((s) => s.user);
  const hasRecordUpload = useSubscriptionStore((s) => s.hasEntitlement('record_upload'));
  const isArtistWithPlan = user?.role === 'artist' && hasRecordUpload;

  const [comingSoonFeature, setComingSoonFeature] = useState<
    'store' | 'info' | 'notifications' | null
  >(null);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [dropdownVisible, setDropdownVisible] = useState(false);

  return (
    <View style={styles.container}>
      <View style={styles.leftIcons}>
        <TouchableOpacity
          onPress={() =>
            isArtistWithPlan ? setActionSheetVisible(true) : router.push('/create-post')
          }
          style={styles.iconButton}
        >
          <Ionicons name="add" size={28} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setComingSoonFeature('store')}
          style={styles.iconButton}
        >
          <Ionicons name="bag-outline" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.logoContainer}
        onPress={() => setDropdownVisible(true)}
        activeOpacity={0.8}
      >
        <Image source={{ uri: ATTO_LOGO_URI }} style={styles.logo} resizeMode="contain" />
        <Text style={styles.logoSubtext}>sound</Text>
      </TouchableOpacity>

      <View style={styles.rightIcons}>
        <TouchableOpacity
          onPress={() => setComingSoonFeature('info')}
          style={styles.iconButton}
        >
          <Ionicons name="information-circle-outline" size={26} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setComingSoonFeature('notifications')}
          style={styles.iconButton}
        >
          <Ionicons name="notifications-outline" size={26} color="#FFF" />
        </TouchableOpacity>
      </View>

      <ComingSoonModal
        visible={comingSoonFeature !== null}
        onClose={() => setComingSoonFeature(null)}
        icon={
          comingSoonFeature === 'store'
            ? 'bag-handle-outline'
            : comingSoonFeature === 'info'
              ? 'information-circle-outline'
              : 'notifications-outline'
        }
        title={
          comingSoonFeature === 'store'
            ? 'Atto Store'
            : comingSoonFeature === 'info'
              ? 'About Atto'
              : 'Notifications'
        }
        description={
          comingSoonFeature === 'store'
            ? 'Shop exclusive merch from your favorite artists. Drops, collabs, and limited editions — all in one place.'
            : comingSoonFeature === 'info'
              ? 'Learn more about Atto Sound, our mission, and how we connect artists with the world.'
              : 'Stay in the loop — likes, comments, follows, and messages. All your activity in one place.'
        }
      />
      <CreateActionSheet
        visible={actionSheetVisible}
        onClose={() => setActionSheetVisible(false)}
      />
      <Modal
        visible={dropdownVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDropdownVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setDropdownVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.dropdown}>
                <TouchableOpacity
                  style={styles.dropdownItem}
                  activeOpacity={0.7}
                  onPress={() => {
                    setDropdownVisible(false);
                    router.push('/following');
                  }}
                >
                  <Ionicons name="people-outline" size={20} color="#FFF" />
                  <Text style={styles.dropdownText}>Following</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
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
  logoContainer: {
    alignItems: 'center',
  },
  logo: {
    width: 100,
    height: 28,
  },
  logoSubtext: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_400Regular',
    fontSize: 7,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  modalOverlay: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 96,
  },
  dropdown: {
    backgroundColor: '#111',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#222',
    minWidth: 180,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  dropdownText: {
    color: '#FFF',
    fontFamily: 'Archivo_500Medium',
    fontSize: 15,
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
