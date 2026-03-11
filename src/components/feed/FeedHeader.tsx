import { useState } from 'react';
import { View, Image, TouchableOpacity, StyleSheet, Modal, TouchableWithoutFeedback } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { ComingSoonModal } from '@/components/ui/ComingSoonModal';
import { CreateActionSheet } from './CreateActionSheet';
import { useSubscriptionStore } from '@/stores/subscriptionStore';

const ATTO_LOGO_URI =
  'https://res.cloudinary.com/dxzcutnlp/image/upload/v1771017624/Property_1_Variant4_vq9shb.png';

export function FeedHeader() {
  const canUpload = useSubscriptionStore((s) => s.subscription?.entitlements?.includes('record_upload') ?? false);
  const [comingSoonVisible, setComingSoonVisible] = useState(false);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [dropdownVisible, setDropdownVisible] = useState(false);

  const showComingSoon = () => setComingSoonVisible(true);

  return (
    <View style={styles.container}>
      <View style={styles.leftIcons}>
        {canUpload && (
          <TouchableOpacity
            onPress={() => setActionSheetVisible(true)}
            style={styles.iconButton}
          >
            <Ionicons name="add" size={28} color="#FFF" />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={showComingSoon} style={styles.iconButton}>
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
    fontSize: 9,
    letterSpacing: 4,
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
