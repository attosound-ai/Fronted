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
import { Ionicons } from '@expo/vector-icons';
import { StepProps } from '@/types/registration';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Toast, showToast } from '@/components/ui/Toast';
import { paymentService } from '@/lib/api/paymentService';

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 40; // ~2 minutes

/**
 * Step 9: Bridge Number Display
 * Shows the unique bridge number and allows copying/sharing/saving as contact.
 * Polls the backend if the number hasn't been provisioned yet.
 */
export const StepBridgeNumber: React.FC<StepProps> = ({
  state,
  dispatch,
  onNext,
  isLoading,
  apiError,
}) => {
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
        const result = await paymentService.getBridgeNumber();
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
      } catch {
        // Network error — keep polling
      }

      pollCount.current += 1;
      if (pollCount.current < MAX_POLL_ATTEMPTS) {
        timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      } else {
        setProvisioning(false); // Give up — show "Not available"
      }
    };

    poll();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state.bridgeNumber, dispatch]);

  const bridgeNumber = state.bridgeNumber ?? null;
  const artistName = state.artistName || 'ATTO Bridge';

  const handleCopy = async () => {
    try {
      const ExpoClipboard = require('expo-clipboard');
      await ExpoClipboard.setStringAsync(bridgeNumber);
      showToast('Copied to clipboard');
    } catch {
      await Share.share({ message: bridgeNumber });
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Your ATTO Bridge Number: ${bridgeNumber}\n\nUse this number to connect with your artist.`,
        title: 'ATTO Bridge Number',
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
          'Permission required',
          'Allow access to Contacts to save the bridge number.'
        );
        return;
      }
      await Contacts.presentFormAsync(null, {
        name: `ATTO Bridge - ${artistName}`,
        phoneNumbers: [{ number: bridgeNumber, label: 'mobile' }],
      });
    } catch {
      await Share.share({
        message: `ATTO Bridge - ${artistName}\n${bridgeNumber}`,
        title: 'Save Bridge Contact',
      });
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text variant="h1" style={styles.title}>
            Your Bridge Number
          </Text>
          <Text style={styles.subtitle}>
            This is your unique number for connecting with the artist. Share it securely.
          </Text>
        </View>

        {/* Bridge Number Display */}
        <View style={styles.numberContainer}>
          {provisioning ? (
            <View style={styles.provisioningContainer}>
              <ActivityIndicator size="large" color="#3B82F6" />
              <Text style={styles.provisioningText}>Assigning your unique number...</Text>
            </View>
          ) : provisioningFailed ? (
            <View style={styles.provisioningContainer}>
              <Ionicons name="alert-circle-outline" size={40} color="#EF4444" />
              <Text style={styles.failedText}>
                We could not purchase your number. Please try again later.
              </Text>
            </View>
          ) : (
            <RNText style={styles.bridgeNumber} allowFontScaling={false}>
              {bridgeNumber ?? 'Not available'}
            </RNText>
          )}
        </View>

        {/* Action Buttons */}
        <View style={[styles.actionsContainer, (provisioning || provisioningFailed) && styles.disabledActions]}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleCopy}
            activeOpacity={0.7}
            disabled={provisioning || provisioningFailed}
          >
            <Ionicons
              name="copy-outline"
              size={22}
              color={provisioning || provisioningFailed ? '#555' : '#FFFFFF'}
            />
            <Text style={[styles.actionText, (provisioning || provisioningFailed) && styles.disabledText]}>
              Copy
            </Text>
          </TouchableOpacity>

          <View style={styles.actionDivider} />

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleShare}
            activeOpacity={0.7}
            disabled={provisioning || provisioningFailed}
          >
            <Ionicons
              name="share-outline"
              size={22}
              color={provisioning || provisioningFailed ? '#555' : '#FFFFFF'}
            />
            <Text style={[styles.actionText, (provisioning || provisioningFailed) && styles.disabledText]}>
              Share
            </Text>
          </TouchableOpacity>

          <View style={styles.actionDivider} />

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleSaveContact}
            activeOpacity={0.7}
            disabled={provisioning || provisioningFailed}
          >
            <Ionicons
              name="person-add-outline"
              size={22}
              color={provisioning || provisioningFailed ? '#555' : '#FFFFFF'}
            />
            <Text style={[styles.actionText, (provisioning || provisioningFailed) && styles.disabledText]}>
              Save
            </Text>
          </TouchableOpacity>
        </View>

        {/* Info notes */}
        <View style={styles.notesContainer}>
          <View style={styles.noteRow}>
            <View style={styles.bullet} />
            <Text style={styles.noteText}>
              Keep this number secure. The artist will need it to verify and establish the
              connection.
            </Text>
          </View>
          <View style={styles.noteRow}>
            <View style={styles.bullet} />
            <Text style={styles.noteText}>
              An OTP will be sent to the inmate to verify your representation before the
              bridge call can be established.
            </Text>
          </View>
        </View>

        {/* Spacer to push button to bottom */}
        <View style={styles.spacer} />
      </ScrollView>

      {/* Error */}
      {apiError && (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={16} color="#EF4444" />
          <Text style={styles.errorText}>{apiError}</Text>
        </View>
      )}

      {/* Bottom button */}
      <View style={styles.footer}>
        <Button
          title={provisioning ? 'Assigning number...' : 'Continue'}
          onPress={onNext}
          disabled={isLoading || provisioning}
          loading={isLoading || provisioning}
        />
      </View>

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
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 28,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontFamily: 'Poppins_400Regular',
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
    fontFamily: 'Poppins_600SemiBold',
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
    fontFamily: 'Poppins_400Regular',
    fontSize: 15,
    color: '#999999',
    textAlign: 'center',
  },
  failedText: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 15,
    color: '#EF4444',
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
    fontFamily: 'Poppins_600SemiBold',
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
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: '#CCCCCC',
  },
  spacer: {
    flex: 1,
    minHeight: 40,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2D1515',
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 24,
    marginBottom: 8,
  },
  errorText: {
    flex: 1,
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    color: '#EF4444',
  },
  footer: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    paddingBottom: 32,
    backgroundColor: '#000000',
    borderTopWidth: 1,
    borderTopColor: '#222222',
  },
});
