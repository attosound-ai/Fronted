import { useState, useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui/Text';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { OtpInput } from '@/components/ui/OtpInput';
import { Checkbox } from '@/components/ui/Checkbox';
import { Avatar } from '@/components/ui/Avatar';
import { useDeleteAccount } from '../hooks/useDeleteAccount';
import { useLinkedAccounts } from '../hooks/useLinkedAccounts';
import type { User } from '@/types';

type Step = 'warning' | 'otp' | 'deleting';

interface DeleteAccountBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  user: User;
}

function maskIdentifier(value: string): string {
  if (value.includes('@')) {
    const [local, domain] = value.split('@');
    return `${local[0]}${'*'.repeat(Math.max(local.length - 2, 1))}${local.slice(-1)}@${domain}`;
  }
  // Phone: show last 4 digits
  return `${'*'.repeat(Math.max(value.length - 4, 0))}${value.slice(-4)}`;
}

export function DeleteAccountBottomSheet({
  visible,
  onClose,
  user,
}: DeleteAccountBottomSheetProps) {
  const { t } = useTranslation('profile');
  const { linkedAccounts, hasLinkedAccounts, refetch: refetchLinked } = useLinkedAccounts();

  // Refetch linked accounts every time the bottom sheet opens
  useEffect(() => {
    if (visible) refetchLinked();
  }, [visible, refetchLinked]);
  const {
    sendOtp,
    isSendingOtp,
    otpSent,
    deleteAccount,
    isDeleting,
    deleteError,
    reset,
  } = useDeleteAccount();

  // Show linked accounts section if API returned data OR user's role implies linked accounts
  const userHasLinkedRole = user.role === 'representative' || user.isManagedAccount;
  const showLinkedSection = hasLinkedAccounts || userHasLinkedRole;

  const [step, setStep] = useState<Step>('warning');
  const [deleteLinked, setDeleteLinked] = useState(false);
  const [otpCode, setOtpCode] = useState('');

  // Determine OTP identifier: prefer email, fall back to phone.
  // For managed creators without contact info, use the representative's.
  // For managed creators without contact info, fetch the representative's email
  const [otpIdentifier, setOtpIdentifier] = useState('');
  useEffect(() => {
    const userEmail = user.email || '';
    const userPhone = user.phoneCountryCode && user.phoneNumber
      ? `${user.phoneCountryCode}${user.phoneNumber}`
      : '';

    if (userEmail || userPhone) {
      setOtpIdentifier(userEmail || userPhone);
      return;
    }

    // Managed creator without contact — fetch representative's profile
    if (user.isManagedAccount && user.representativeId) {
      import('@/lib/api/client').then(({ apiClient }) => {
        apiClient
          .get(`/users/${user.representativeId}`)
          .then((res) => {
            const rep = res.data?.data;
            if (rep?.email) {
              setOtpIdentifier(rep.email);
            } else if (rep?.phoneCountryCode && rep?.phoneNumber) {
              setOtpIdentifier(`${rep.phoneCountryCode}${rep.phoneNumber}`);
            }
          })
          .catch(() => {});
      });
    }
  }, [user, visible]);

  const handleClose = () => {
    setStep('warning');
    setDeleteLinked(false);
    setOtpCode('');
    reset();
    onClose();
  };

  const handleContinue = () => {
    if (!otpIdentifier) return;
    sendOtp(otpIdentifier);
    setStep('otp');
  };

  const handleDelete = () => {
    if (otpCode.length < 6) return;
    setStep('deleting');
    deleteAccount({
      otpCode,
      otpIdentifier,
      deleteLinkedAccounts: deleteLinked,
    });
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title={t('deleteAccount.title', { defaultValue: 'Delete Account' })}
    >
      {step === 'warning' && (
        <View style={styles.content}>
          <View style={styles.iconWrap}>
            <AlertTriangle size={40} color="#EF4444" strokeWidth={2} />
          </View>

          <Text style={styles.warningTitle}>
            {t('deleteAccount.warningTitle', {
              defaultValue: 'This action is permanent',
            })}
          </Text>

          <Text style={styles.warningText}>
            {t('deleteAccount.warningBody', {
              defaultValue:
                'All your data will be permanently deleted: posts, messages, likes, comments, followers, subscriptions, and more. This cannot be undone.',
            })}
          </Text>

          {showLinkedSection && (
            <View style={styles.linkedSection}>
              <TouchableOpacity
                style={styles.checkboxRow}
                activeOpacity={0.7}
                onPress={() => setDeleteLinked(!deleteLinked)}
              >
                <Checkbox checked={deleteLinked} onToggle={() => setDeleteLinked(!deleteLinked)} />
                <Text style={styles.checkboxLabel}>
                  {t('deleteAccount.deleteLinked', {
                    defaultValue: 'Also delete linked accounts',
                    count: linkedAccounts.length,
                  })}
                </Text>
              </TouchableOpacity>

              {deleteLinked && Array.isArray(linkedAccounts) &&
                linkedAccounts.map((acc) => (
                  <View key={acc.id} style={styles.linkedAccount}>
                    <Avatar uri={acc.avatar} size="sm" />
                    <View>
                      <Text style={styles.linkedName}>{acc.displayName}</Text>
                      <Text style={styles.linkedUsername}>@{acc.username}</Text>
                    </View>
                  </View>
                ))}
            </View>
          )}

          <TouchableOpacity
            style={styles.continueButton}
            activeOpacity={0.7}
            onPress={handleContinue}
            disabled={!otpIdentifier}
          >
            <Text style={styles.continueButtonText}>
              {t('deleteAccount.continue', { defaultValue: 'Continue' })}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleClose} style={styles.cancelButton}>
            <Text style={styles.cancelText}>
              {t('deleteAccount.cancel', { defaultValue: 'Cancel' })}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 'otp' && (
        <View style={styles.content}>
          <Text style={styles.otpTitle}>
            {t('deleteAccount.otpTitle', {
              defaultValue: 'Verify your identity',
            })}
          </Text>

          <Text style={styles.otpSubtitle}>
            {t('deleteAccount.otpSubtitle', {
              defaultValue: 'We sent a verification code to',
            })}{' '}
            <Text style={styles.otpIdentifier}>
              {maskIdentifier(otpIdentifier)}
            </Text>
          </Text>

          {isSendingOtp ? (
            <ActivityIndicator color="#FFF" style={styles.loader} />
          ) : (
            <>
              <OtpInput value={otpCode} onChange={setOtpCode} autoFocus />

              {deleteError && (
                <Text style={styles.errorText}>
                  {t('deleteAccount.otpError', {
                    defaultValue: 'Invalid code. Please try again.',
                  })}
                </Text>
              )}

              <TouchableOpacity
                style={[
                  styles.deleteButton,
                  otpCode.length < 6 && styles.deleteButtonDisabled,
                ]}
                activeOpacity={0.7}
                onPress={handleDelete}
                disabled={otpCode.length < 6}
              >
                <Text style={styles.deleteButtonText}>
                  {t('deleteAccount.deleteButton', {
                    defaultValue: 'Delete My Account',
                  })}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleClose} style={styles.cancelButton}>
                <Text style={styles.cancelText}>
                  {t('deleteAccount.cancel', { defaultValue: 'Cancel' })}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {step === 'deleting' && (
        <View style={styles.content}>
          {deleteError ? (
            <>
              <View style={styles.iconWrap}>
                <AlertTriangle size={40} color="#EF4444" strokeWidth={2} />
              </View>
              <Text style={styles.warningTitle}>
                {t('deleteAccount.deleteFailed', {
                  defaultValue: 'Something went wrong',
                })}
              </Text>
              <Text style={styles.deletingText}>
                {t('deleteAccount.deleteFailedBody', {
                  defaultValue: 'We could not delete your account. Please try again later.',
                })}
              </Text>
              <TouchableOpacity onPress={handleClose} style={styles.continueButton}>
                <Text style={styles.continueButtonText}>
                  {t('deleteAccount.close', { defaultValue: 'Close' })}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <ActivityIndicator size="large" color="#EF4444" />
              <Text style={styles.deletingText}>
                {t('deleteAccount.deleting', {
                  defaultValue: 'Deleting your account...',
                })}
              </Text>
            </>
          )}
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 16,
  },
  iconWrap: {
    alignItems: 'center',
    paddingTop: 8,
  },
  warningTitle: {
    color: '#FFF',
    fontFamily: 'Archivo_700Bold',
    fontSize: 18,
    textAlign: 'center',
  },
  warningText: {
    color: '#999',
    fontFamily: 'Archivo_400Regular',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  linkedSection: {
    gap: 12,
    paddingTop: 4,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkboxLabel: {
    color: '#FFF',
    fontFamily: 'Archivo_500Medium',
    fontSize: 14,
    flex: 1,
  },
  linkedAccount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 34,
  },
  linkedName: {
    color: '#FFF',
    fontFamily: 'Archivo_500Medium',
    fontSize: 13,
  },
  linkedUsername: {
    color: '#666',
    fontFamily: 'Archivo_400Regular',
    fontSize: 12,
  },
  continueButton: {
    backgroundColor: '#EF4444',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  continueButtonText: {
    color: '#FFF',
    fontFamily: 'Archivo_700Bold',
    fontSize: 15,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  cancelText: {
    color: '#888',
    fontFamily: 'Archivo_500Medium',
    fontSize: 14,
  },
  otpTitle: {
    color: '#FFF',
    fontFamily: 'Archivo_700Bold',
    fontSize: 18,
    textAlign: 'center',
  },
  otpSubtitle: {
    color: '#999',
    fontFamily: 'Archivo_400Regular',
    fontSize: 14,
    textAlign: 'center',
  },
  otpIdentifier: {
    color: '#FFF',
    fontFamily: 'Archivo_600SemiBold',
  },
  loader: {
    paddingVertical: 24,
  },
  errorText: {
    color: '#EF4444',
    fontFamily: 'Archivo_400Regular',
    fontSize: 13,
    textAlign: 'center',
  },
  deleteButton: {
    backgroundColor: '#EF4444',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  deleteButtonDisabled: {
    opacity: 0.4,
  },
  deleteButtonText: {
    color: '#FFF',
    fontFamily: 'Archivo_700Bold',
    fontSize: 15,
  },
  deletingText: {
    color: '#999',
    fontFamily: 'Archivo_400Regular',
    fontSize: 14,
    textAlign: 'center',
  },
});
