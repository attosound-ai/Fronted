import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text as RNText,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { AlertCircle, Copy, Share2, UserPlus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StepProps } from '@/types/registration';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Toast, showToast } from '@/components/ui/Toast';
import { paymentService } from '@/lib/api/paymentService';
import { haptic } from '@/lib/haptics/hapticService';

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 40; // ~2 minutes

/**
 * Step 9: Bridge Number Display
 * Shows the unique bridge number and allows copying/sharing/saving as contact.
 * Polls the backend if the number hasn't been provisioned yet.
 */
export const StepBridgeNumber: React.FC<StepProps & { forUserId?: number }> = ({
  state,
  dispatch,
  onNext,
  isLoading,
  apiError,
  forUserId,
}) => {
  const { t } = useTranslation(['registration', 'common']);
  const [provisioning, setProvisioning] = useState(!state.bridgeNumber);
  const [provisioningFailed, setProvisioningFailed] = useState(false);
  const pollCount = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (state.bridgeNumber) {
      setProvisioning(false);
      return;
    }

    const poll = async () => {
      try {
        const result = await paymentService.getBridgeNumber(forUserId);
        console.log('[BridgeNumber] poll result:', result);
        if (result.status === 'failed') {
          setProvisioningFailed(true);
          setProvisioning(false);
          return;
        }
        if (result.bridgeNumber) {
          dispatch({
            type: 'UPDATE_FIELD',
            field: 'bridgeNumber',
            value: result.bridgeNumber,
          });
          setProvisioning(false);
          return;
        }
      } catch (err) {
        console.warn('[BridgeNumber] poll error:', err);
        // Network/auth error — keep polling
      }

      pollCount.current += 1;
      if (pollCount.current < MAX_POLL_ATTEMPTS) {
        timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      } else {
        setProvisioning(false); // Give up — show "Not available"
      }
    };

    // Delay first poll to let auth tokens settle after registration
    timerRef.current = setTimeout(poll, 2000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state.bridgeNumber, dispatch]);

  const bridgeNumber = state.bridgeNumber ?? null;
  const creatorName = state.creatorName || 'ATTO Bridge';

  const handleCopy = async () => {
    try {
      const ExpoClipboard = require('expo-clipboard');
      await ExpoClipboard.setStringAsync(bridgeNumber);
      showToast(t('common:toasts.copiedToClipboard'));
    } catch {
      await Share.share({ message: bridgeNumber });
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: t('bridgeNumber.shareMessage', { number: bridgeNumber }),
        title: t('bridgeNumber.shareTitle'),
      });
    } catch {
      // User cancelled share
    }
  };

  const handleSaveContact = async () => {
    try {
      const Contacts = require('expo-contacts');
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          t('bridgeNumber.contactPermission'),
          t('bridgeNumber.contactPermissionMessage')
        );
        return;
      }
      await Contacts.presentFormAsync(null, {
        name: `ATTO Bridge - ${creatorName}`,
        phoneNumbers: [{ number: bridgeNumber, label: 'mobile' }],
      });
    } catch {
      await Share.share({
        message: `ATTO Bridge - ${creatorName}\n${bridgeNumber}`,
        title: t('bridgeNumber.saveContactTitle'),
      });
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text variant="h1" style={styles.title}>
            {t('bridgeNumber.title')}
          </Text>
          <Text style={styles.subtitle}>{t('bridgeNumber.subtitle')}</Text>
        </View>

        {/* Bridge Number Display */}
        <View style={styles.numberContainer}>
          {provisioning ? (
            <View style={styles.provisioningContainer}>
              <ActivityIndicator size="large" color="#FFFFFF" />
              <Text style={styles.provisioningText}>{t('bridgeNumber.assigning')}</Text>
            </View>
          ) : provisioningFailed ? (
            <View style={styles.provisioningContainer}>
              <AlertCircle size={40} color="#FFFFFF" strokeWidth={2.25} />
              <Text style={styles.failedText}>{t('bridgeNumber.purchaseFailed')}</Text>
            </View>
          ) : (
            <RNText style={styles.bridgeNumber} allowFontScaling={false}>
              {bridgeNumber ?? t('bridgeNumber.notAvailable')}
            </RNText>
          )}
        </View>

        {/* Action Buttons */}
        <View
          style={[
            styles.actionsContainer,
            (provisioning || provisioningFailed) && styles.disabledActions,
          ]}
        >
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleCopy}
            activeOpacity={0.7}
            disabled={provisioning || provisioningFailed}
          >
            <Copy
              size={22}
              color={provisioning || provisioningFailed ? '#555' : '#FFFFFF'}
              strokeWidth={2.25}
            />
            <Text
              style={[
                styles.actionText,
                (provisioning || provisioningFailed) && styles.disabledText,
              ]}
            >
              {t('common:buttons.copy')}
            </Text>
          </TouchableOpacity>

          <View style={styles.actionDivider} />

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleShare}
            activeOpacity={0.7}
            disabled={provisioning || provisioningFailed}
          >
            <Share2
              size={22}
              color={provisioning || provisioningFailed ? '#555' : '#FFFFFF'}
              strokeWidth={2.25}
            />
            <Text
              style={[
                styles.actionText,
                (provisioning || provisioningFailed) && styles.disabledText,
              ]}
            >
              {t('common:buttons.share')}
            </Text>
          </TouchableOpacity>

          <View style={styles.actionDivider} />

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleSaveContact}
            activeOpacity={0.7}
            disabled={provisioning || provisioningFailed}
          >
            <UserPlus
              size={22}
              color={provisioning || provisioningFailed ? '#555' : '#FFFFFF'}
              strokeWidth={2.25}
            />
            <Text
              style={[
                styles.actionText,
                (provisioning || provisioningFailed) && styles.disabledText,
              ]}
            >
              {t('bridgeNumber.save')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Info notes */}
        <View style={styles.notesContainer}>
          <View style={styles.noteRow}>
            <View style={styles.bullet} />
            <Text style={styles.noteText}>{t('bridgeNumber.noteSecure')}</Text>
          </View>
          <View style={styles.noteRow}>
            <View style={styles.bullet} />
            <Text style={styles.noteText}>{t('bridgeNumber.noteOtp')}</Text>
          </View>
        </View>

        {/* Spacer */}
        <View style={{ height: 40 }} />

        {/* Error */}
        {apiError && (
          <View style={styles.errorBox}>
            <AlertCircle size={16} color="#FFFFFF" strokeWidth={2.25} />
            <Text style={styles.errorText}>{apiError}</Text>
          </View>
        )}

        {/* Bottom button */}
        <View style={styles.buttonWrapper}>
          <Button
            title={
              provisioning
                ? t('bridgeNumber.assigningButton')
                : t('common:buttons.continue')
            }
            onPress={() => { haptic('light'); onNext(); }}
            disabled={isLoading || provisioning}
            loading={isLoading || provisioning}
          />
        </View>
      </ScrollView>

      <Toast />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 28,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 15,
    lineHeight: 22,
    color: '#CCCCCC',
    textAlign: 'center',
  },
  numberContainer: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#333333',
  },
  bridgeNumber: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 28,
    lineHeight: 40,
    color: '#FFFFFF',
    letterSpacing: 2,
    textAlign: 'center',
  },
  provisioningContainer: {
    alignItems: 'center',
    gap: 16,
  },
  provisioningText: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 15,
    color: '#999999',
    textAlign: 'center',
  },
  failedText: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 15,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 22,
  },
  disabledActions: {
    opacity: 0.4,
  },
  disabledText: {
    color: '#555555',
  },
  actionsContainer: {
    flexDirection: 'row',
    backgroundColor: '#111111',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#222222',
    overflow: 'hidden',
    marginBottom: 24,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 6,
  },
  actionDivider: {
    width: 1,
    backgroundColor: '#222222',
  },
  actionText: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  notesContainer: {
    gap: 16,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    marginTop: 7,
  },
  noteText: {
    flex: 1,
    fontFamily: 'Archivo_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: '#CCCCCC',
  },
  buttonWrapper: {
    marginBottom: 16,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 24,
    marginBottom: 8,
  },
  errorText: {
    flex: 1,
    fontFamily: 'Archivo_400Regular',
    fontSize: 13,
    color: '#FFFFFF',
  },
});
