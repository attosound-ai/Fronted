import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { OtpInput } from '@/components/ui/OtpInput';
import { useAuthStore } from '@/stores/authStore';
import { useVerification } from '../hooks/useVerification';
import { CreatorInfoCard } from './CreatorInfoCard';

/**
 * VerificationBanner — Full-width gray banner shown to unverified representatives.
 *
 * Sits directly below the feed header, occupying the full width.
 * Always shows OTP input fields (auto-sends OTP on mount).
 */
export function VerificationBanner() {
  const { t } = useTranslation('feed');
  const user = useAuthStore((s) => s.user);
  const {
    otpCode,
    otpError,
    isVerifying,
    isFetchingBridge,
    hasBridgePhone,
    handleOtpChange,
  } = useVerification();

  // Only show for unverified representatives
  if (!user || user.role !== 'representative' || user.profileVerified) {
    return null;
  }

  const creatorName = user.creatorName || 'Unknown Creator';
  const creatorEmail = user.creatorEmail || user.email;

  const handleEdit = () => {
    router.push('/edit-creator-contact');
  };

  return (
    <View style={styles.container}>
      <Text variant="body" style={styles.title}>
        {t('verification.bannerTitle')}
      </Text>
      <Text variant="caption" style={styles.subtitle}>
        {t('verification.bannerSubtitle')}
      </Text>

      {/* OTP fields */}
      <View style={styles.otpSection}>
        {isFetchingBridge ? (
          <ActivityIndicator color="#666" size="small" />
        ) : !hasBridgePhone ? (
          <Text variant="caption" style={styles.noBridgeText}>
            Bridge number not set up. Please complete your subscription or contact
            support.
          </Text>
        ) : (
          <>
            <OtpInput
              value={otpCode}
              onChange={handleOtpChange}
              error={otpError ?? undefined}
              autoFocus={false}
            />
            {isVerifying && (
              <ActivityIndicator color="#999" size="small" style={styles.spinner} />
            )}
          </>
        )}
      </View>

      {/* Creator info row */}
      <CreatorInfoCard creatorName={creatorName} email={creatorEmail} onEdit={handleEdit} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    gap: 8,
  },
  title: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 14,
    lineHeight: 20,
  },
  subtitle: {
    color: '#888',
    fontSize: 12,
    lineHeight: 16,
  },
  otpSection: {
    paddingVertical: 4,
  },
  spinner: {
    marginTop: 8,
  },
  noBridgeText: {
    color: '#888',
    fontSize: 12,
    lineHeight: 16,
  },
});
