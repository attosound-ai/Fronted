import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { LanguageSelectorButton } from '@/components/ui/LanguageSelectorButton';

export default function WelcomeScreen() {
  const { t } = useTranslation('auth');
  return (
    <SafeAreaView style={styles.container}>
      <LanguageSelectorButton style={styles.languageButton} />
      <View style={styles.top}>
        <Logo size={240} animated />
      </View>

      <View style={styles.bottom}>
        <Button
          title={t('welcome.signIn')}
          onPress={() => router.push('/(auth)/login')}
        />

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text variant="caption" style={styles.dividerText}>
            {t('welcome.or')}
          </Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity style={styles.googleBtn} disabled activeOpacity={0.7}>
          <Ionicons name="logo-google" size={18} color="#4285F4" />
          <Text style={styles.socialText}>{t('welcome.continueWithGoogle')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.appleBtn} disabled activeOpacity={0.7}>
          <Ionicons name="logo-apple" size={20} color="#FFFFFF" />
          <Text style={styles.socialText}>{t('welcome.continueWithApple')}</Text>
        </TouchableOpacity>

        <View style={styles.signUpRow}>
          <Text variant="caption" style={{ color: '#888' }}>
            {t('welcome.noAccount')}{' '}
          </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
            <Text style={styles.signUpLink}>{t('welcome.signUp')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  languageButton: {
    position: 'absolute',
    top: 56,
    right: 16,
    zIndex: 10,
  },
  top: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottom: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    gap: 12,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#333',
  },
  dividerText: {
    color: '#666',
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 8,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#4285F4',
    opacity: 0.4,
  },
  appleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 8,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    opacity: 0.4,
  },
  signUpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  signUpLink: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  socialText: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 14,
  },
});
