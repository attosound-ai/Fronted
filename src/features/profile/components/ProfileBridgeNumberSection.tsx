import { View, StyleSheet, TouchableOpacity, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { showToast } from '@/components/ui/Toast';
import { ProfileSection } from './ProfileSection';
import { ProfileInfoRow } from './ProfileInfoRow';
import { useBridgeNumber } from '../hooks/useBridgeNumber';

function statusDisplay(status: string): { text: string; color: string } {
  switch (status) {
    case 'assigned':
      return { text: 'Active', color: '#10B981' };
    case 'provisioning':
      return { text: 'Provisioning...', color: '#F59E0B' };
    case 'failed':
      return { text: 'Failed', color: '#EF4444' };
    default:
      return { text: status, color: '#888888' };
  }
}

export function ProfileBridgeNumberSection() {
  const { bridgeNumber, status, isLoading } = useBridgeNumber();

  if (!isLoading && !bridgeNumber && status !== 'provisioning') return null;

  const { text: statusText, color: statusColor } = statusDisplay(status);

  const handleCopy = async () => {
    if (!bridgeNumber) return;
    try {
      const ExpoClipboard = require('expo-clipboard');
      await ExpoClipboard.setStringAsync(bridgeNumber);
      showToast('Copied to clipboard');
    } catch {
      await Share.share({ message: bridgeNumber });
    }
  };

  const handleShare = async () => {
    if (!bridgeNumber) return;
    try {
      await Share.share({
        message: `My ATTO Bridge Number: ${bridgeNumber}`,
        title: 'ATTO Bridge Number',
      });
    } catch {
      // User cancelled share
    }
  };

  return (
    <ProfileSection title="Bridge Number">
      <ProfileInfoRow
        icon="call-outline"
        label="Number"
        value={isLoading ? 'Loading...' : (bridgeNumber ?? 'Not assigned')}
      />
      <ProfileInfoRow
        icon="pulse-outline"
        label="Status"
        value={statusText}
        valueColor={statusColor}
        showDivider={!!bridgeNumber}
      />
      {bridgeNumber && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleCopy}
            activeOpacity={0.7}
          >
            <Ionicons name="copy-outline" size={16} color="#3B82F6" />
            <Text style={styles.actionText}>Copy</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleShare}
            activeOpacity={0.7}
          >
            <Ionicons name="share-outline" size={16} color="#3B82F6" />
            <Text style={styles.actionText}>Share</Text>
          </TouchableOpacity>
        </View>
      )}
    </ProfileSection>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    paddingTop: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#1A2A4A',
  },
  actionText: {
    color: '#3B82F6',
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 13,
  },
});
