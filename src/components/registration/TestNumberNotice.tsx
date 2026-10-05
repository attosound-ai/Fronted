import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text as RNText } from 'react-native';
import { Image } from 'expo-image';
import { Trans, useTranslation } from 'react-i18next';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { cloudinaryUrl } from '@/lib/media/cloudinaryUrl';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';

/** The official account a creator asks for a real number (David, Oct 4 2026). */
export const OFFICIAL_ACCOUNT = 'attosound';

export interface OfficialProfile {
  username: string;
  avatar: string | null;
}

/**
 * Shown under a Twilio test number (+1 500 555): it looks real but can never
 * ring. Minimal, black and white like the rest of the step, a white border so
 * it is noticed, and the official account's photo and @ so it is easy to find.
 * Never hides or disables anything on the screen.
 */
export function TestNumberNotice({
  number,
  preloadedProfile = null,
}: {
  number: string;
  /** Skips the lookup (previews and tests); the signup step never passes it. */
  preloadedProfile?: OfficialProfile | null;
}) {
  const { t } = useTranslation('registration');
  const [profile, setProfile] = useState<OfficialProfile | null>(preloadedProfile);

  useEffect(() => {
    analytics.capture(ANALYTICS_EVENTS.REGISTRATION.TEST_NUMBER_NOTICE_SHOWN, {
      number_suffix: number.slice(-4),
    });
    if (preloadedProfile) return;
    let alive = true;
    apiClient
      .get(API_ENDPOINTS.USERS.SEARCH, { params: { q: OFFICIAL_ACCOUNT } })
      .then((res) => {
        const list = (res.data?.data ?? []) as { username?: string; avatar?: string | null }[];
        const exact = list.find((u) => u.username?.toLowerCase() === OFFICIAL_ACCOUNT);
        if (alive && exact) setProfile({ username: exact.username!, avatar: exact.avatar ?? null });
      })
      .catch(() => {
        // The @ still shows without the photo.
      });
    return () => {
      alive = false;
    };
  }, [number, preloadedProfile]);

  const avatarUri = cloudinaryUrl(profile?.avatar ?? null, 'avatar_sm');

  return (
    <View style={styles.card} accessibilityRole="alert">
      <RNText style={styles.text}>
        <Trans
          t={t}
          i18nKey="bridgeNumber.testNumberNotice"
          components={{ b: <RNText style={styles.strong} /> }}
        />
      </RNText>
      <View style={styles.account}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={[styles.avatar, styles.avatarEmpty]}>
            <RNText style={styles.avatarLetter}>A</RNText>
          </View>
        )}
        <RNText style={styles.handle}>@{profile?.username ?? OFFICIAL_ACCOUNT}</RNText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 24,
    gap: 12,
  },
  text: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: '#FFFFFF',
  },
  strong: { fontFamily: 'Archivo_700Bold' },
  account: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#222222' },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: '#FFFFFF', fontFamily: 'Archivo_600SemiBold', fontSize: 13 },
  handle: { fontFamily: 'Archivo_600SemiBold', fontSize: 15, color: '#FFFFFF' },
});
