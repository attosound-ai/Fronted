import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/Button';
import { haptic } from '@/lib/haptics/hapticService';

export default function WelcomeScreen() {
  const { t } = useTranslation('auth');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.logoSection}>
        <Logo size={290} animated />
      </View>

      <View style={styles.buttons}>
        <Button
          title={t('login.signIn')}
          onPress={() => {
            haptic('light');
            router.push('/(auth)/login');
          }}
        />
        <Button
          title={t('login.createAccount')}
          variant="outline"
          onPress={() => {
            haptic('light');
            router.push('/(auth)/register');
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  logoSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 20,
  },
  buttons: {
    paddingHorizontal: 24,
    paddingBottom: 100,
    gap: 24,
  },
});
