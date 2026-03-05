import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { OtpInput } from '@/components/ui/OtpInput';
import { useAuthStore } from '@/stores/authStore';
import { useVerification } from '../hooks/useVerification';
import { ArtistInfoCard } from './ArtistInfoCard';

/**
 * VerificationBanner — Full-width gray banner shown to unverified representatives.
 *
 * Sits directly below the feed header, occupying the full width.
 * Always shows OTP input fields (auto-sends OTP on mount).
 */
export function VerificationBanner() {
  const user = useAuthStore((s) => s.user);

  const { otpCode, otpError, isVerifying, isFetchingBridge, handleOtpChange } =
    useVerification();

  // Only show for unverified representatives
  if (!user || user.role !== 'representative' || user.profileVerified) {
    return null;
  }

  const artistName = user.artistName || 'Unknown Artist';
  const artistEmail = user.artistEmail || user.email;

  const handleEdit = () => {
    router.push('/edit-artist-contact');
  };

  return (
    <View style={styles.container}>
      <Text variant="body" style={styles.title}>
        Authorization pending
      </Text>
      <Text variant="caption" style={styles.subtitle}>
        Enter Artist code to get consent
      </Text>

      {/* OTP fields — always visible */}
      <View style={styles.otpSection}>
        {isFetchingBridge ? (
          <ActivityIndicator color="#666" size="small" />
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

      {/* Artist info row */}
      <ArtistInfoCard artistName={artistName} email={artistEmail} onEdit={handleEdit} />
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
    fontFamily: 'Poppins_600SemiBold',
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
});
