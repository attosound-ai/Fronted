import { View, StyleSheet, TouchableOpacity, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { showToast } from '@/components/ui/Toast';
import { ProfileSection } from './ProfileSection';
import { ProfileInfoRow } from './ProfileInfoRow';
import { useBridgeNumber } from '../hooks/useBridgeNumber';

export function ProfileBridgeNumberSection() {
  const { t } = useTranslation('profile');
  const { bridgeNumber, status, isLoading } = useBridgeNumber();

  if (!isLoading && !bridgeNumber && status !== 'provisioning') return null;

  function statusDisplay(s: string): { text: string; color: string } {
    switch (s) {
      case 'assigned':
        return { text: t('bridgeNumber.statusActive'), color: '#10B981' };
      case 'provisioning':
        return { text: t('bridgeNumber.statusProvisioning'), color: '#F59E0B' };
      case 'failed':
        return { text: t('bridgeNumber.statusFailed'), color: '#EF4444' };
      default:
        return { text: s, color: '#888888' };
    }
  }

  const { text: statusText, color: statusColor } = statusDisplay(status);

  const handleCopy = async () => {
    if (!bridgeNumber) return;
    try {
      const ExpoClipboard = require('expo-clipboard');
      await ExpoClipboard.setStringAsync(bridgeNumber);
      showToast(t('bridgeNumber.copiedToast'));
    } catch {
      await Share.share({ message: bridgeNumber });
    }
  };

  const handleShare = async () => {
    if (!bridgeNumber) return;
    try {
      await Share.share({
        message: t('bridgeNumber.shareMessage', { number: bridgeNumber }),
        title: t('bridgeNumber.shareTitle'),
      });
    } catch {
      // User cancelled share
    }
  };

  return (
    <ProfileSection title={t('bridgeNumber.sectionTitle')}>
      <ProfileInfoRow
        icon="call-outline"
        label={t('bridgeNumber.numberLabel')}
        value={
          isLoading
            ? t('bridgeNumber.numberLoading')
            : (bridgeNumber ?? t('bridgeNumber.numberNotAssigned'))
        }
      />
      <ProfileInfoRow
        icon="pulse-outline"
        label={t('bridgeNumber.statusLabel')}
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
            <Ionicons name="copy-outline" size={16} color="#FFFFFF" />
            <Text style={styles.actionText}>{t('bridgeNumber.copyButton')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleShare}
            activeOpacity={0.7}
          >
            <Ionicons name="share-outline" size={16} color="#FFFFFF" />
            <Text style={styles.actionText}>{t('bridgeNumber.shareButton')}</Text>
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
    color: '#FFFFFF',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 13,
  },
});
