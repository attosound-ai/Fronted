import { useState } from 'react';
import { View, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { Text, Button } from '@/components/ui';
import { StepProps } from '@/types/registration';
import { isStrongPassword } from '@/utils/validators';
import { haptic } from '@/lib/haptics/hapticService';

/**
 * StepArtistPassword - Step 9: Password + confirm for the artist account
 */
export function StepArtistPassword({
  state,
  dispatch,
  onNext,
  isLoading,
  apiError,
}: StepProps) {
  const { t } = useTranslation(['registration', 'common', 'validation']);
  const { t: tv } = useTranslation('validation');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const strengthChecks = {
    length: state.artistPassword.length >= 8,
    upper: /[A-Z]/.test(state.artistPassword),
    lower: /[a-z]/.test(state.artistPassword),
    number: /\d/.test(state.artistPassword),
  };

  const bothFilled = state.artistPassword.length > 0 && state.artistConfirmPassword.length > 0;
  const passwordsMatch = state.artistPassword === state.artistConfirmPassword;
  const canContinue = isStrongPassword(state.artistPassword) && bothFilled && passwordsMatch;

  const handleContinue = () => {
    if (!canContinue) { haptic('error'); return; }
    haptic('light');
    onNext();
  };

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      bottomOffset={16}
      showsVerticalScrollIndicator={false}
    >
      <Text variant="h2" style={styles.title}>{t('artistAccountSetup.passwordTitle')}</Text>
      <Text variant="body" style={styles.subtitle}>{t('artistAccountSetup.passwordSubtitle')}</Text>

      {apiError && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={20} color="#FFFFFF" />
          <Text variant="small" style={styles.errorBannerText}>{apiError}</Text>
        </View>
      )}

      <View style={styles.formArea}>
        {/* Password */}
        <View>
          <View style={styles.passwordWrapper}>
            <TextInput
              value={state.artistPassword}
              onChangeText={(v) => dispatch({ type: 'UPDATE_FIELD', field: 'artistPassword', value: v })}
              placeholder={t('artistAccountSetup.passwordPlaceholder')}
              placeholderTextColor="#666666"
              style={[styles.textInput, { flex: 1 }]}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="off"
            />
            <TouchableOpacity onPress={() => setShowPassword((v) => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color="#888888" />
            </TouchableOpacity>
          </View>

          {state.artistPassword.length > 0 && (
            <View style={styles.strengthContainer}>
              {([
                [strengthChecks.length, tv('strengthLength')],
                [strengthChecks.upper, tv('strengthUpper')],
                [strengthChecks.lower, tv('strengthLower')],
                [strengthChecks.number, tv('strengthNumber')],
              ] as [boolean, string][]).map(([met, label]) => (
                <View key={label} style={styles.strengthRow}>
                  <Ionicons name={met ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={met ? '#FFFFFF' : '#555555'} />
                  <Text variant="small" style={[styles.strengthText, met && styles.strengthMet]}>{label}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Confirm Password */}
        <View>
          <View style={styles.passwordWrapper}>
            <TextInput
              value={state.artistConfirmPassword}
              onChangeText={(v) => dispatch({ type: 'UPDATE_FIELD', field: 'artistConfirmPassword', value: v })}
              placeholder={t('artistAccountSetup.confirmPlaceholder')}
              placeholderTextColor="#666666"
              style={[styles.textInput, { flex: 1 }]}
              secureTextEntry={!showConfirm}
              autoCapitalize="none"
              autoComplete="off"
            />
            <TouchableOpacity onPress={() => setShowConfirm((v) => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name={showConfirm ? 'eye-off' : 'eye'} size={20} color="#888888" />
            </TouchableOpacity>
          </View>
          {bothFilled && passwordsMatch && (
            <Text variant="small" style={styles.matchSuccess}>{tv('passwordMatch')}</Text>
          )}
          {bothFilled && !passwordsMatch && (
            <Text variant="small" style={styles.matchError}>{tv('passwordMismatch')}</Text>
          )}
        </View>

        <Button
          title={t('common:buttons.continue')}
          onPress={handleContinue}
          disabled={isLoading || !canContinue}
          loading={isLoading}
        />
      </View>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  scrollContent: { flexGrow: 1, paddingBottom: 40 },
  title: { color: '#FFFFFF', textAlign: 'center', marginTop: 24, marginBottom: 4 },
  subtitle: { color: '#888888', textAlign: 'center', marginBottom: 24 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#111111', borderWidth: 1, borderColor: '#FFFFFF', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginHorizontal: 24, marginBottom: 12 },
  errorBannerText: { color: '#FFFFFF', flex: 1 },
  formArea: { paddingHorizontal: 24, gap: 20 },
  textInput: { color: '#FFFFFF', fontSize: 16, fontFamily: 'Archivo_400Regular', padding: 0 },
  passwordWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111111', borderRadius: 8, borderWidth: 1, borderColor: '#222222', paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  strengthContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  strengthRow: { flexDirection: 'row', alignItems: 'center', gap: 4, width: '45%' },
  strengthText: { color: '#555555' },
  strengthMet: { color: '#FFFFFF' },
  matchSuccess: { color: '#FFFFFF', marginTop: 6 },
  matchError: { color: '#888888', marginTop: 6 },
});
