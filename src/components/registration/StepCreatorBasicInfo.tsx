import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { AlertCircle, CheckCircle, XCircle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text, Button } from '@/components/ui';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { StepProps } from '@/types/registration';
import { isValidEmail } from '@/utils/validators';
import { haptic } from '@/lib/haptics/hapticService';
import { authService } from '@/lib/api/authService';

type AvailabilityStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

/**
 * StepCreatorBasicInfo - Step 8: Creator name (read-only), email (optional), phone (optional)
 */
export function StepCreatorBasicInfo({
  state,
  dispatch,
  onNext,
  isLoading,
  apiError,
}: StepProps) {
  const { t } = useTranslation(['registration', 'common']);
  const [emailStatus, setEmailStatus] = useState<AvailabilityStatus>('idle');
  const [phoneStatus, setPhoneStatus] = useState<AvailabilityStatus>('idle');
  const emailDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phoneDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCheckedEmailRef = useRef('');
  const lastCheckedPhoneRef = useRef('');

  // Debounced email availability check
  const checkEmail = useCallback((email: string) => {
    if (emailDebounceRef.current) clearTimeout(emailDebounceRef.current);
    const cleaned = email.trim().toLowerCase();
    if (!cleaned) { setEmailStatus('idle'); return; }
    if (!isValidEmail(cleaned)) { setEmailStatus('invalid'); return; }
    if (cleaned === lastCheckedEmailRef.current) return;
    setEmailStatus('checking');
    emailDebounceRef.current = setTimeout(async () => {
      lastCheckedEmailRef.current = cleaned;
      const available = await authService.checkEmail(cleaned);
      setEmailStatus(available ? 'available' : 'taken');
    }, 400);
  }, []);

  // Debounced phone availability check
  const checkPhone = useCallback((countryCode: string, phone: string) => {
    if (phoneDebounceRef.current) clearTimeout(phoneDebounceRef.current);
    if (!phone.trim()) { setPhoneStatus('idle'); return; }
    const fullPhone = `${countryCode}${phone.trim()}`;
    if (fullPhone === lastCheckedPhoneRef.current) return;
    setPhoneStatus('checking');
    phoneDebounceRef.current = setTimeout(async () => {
      lastCheckedPhoneRef.current = fullPhone;
      try {
        await authService.checkPhone(fullPhone);
        setPhoneStatus('available');
      } catch {
        setPhoneStatus('taken');
      }
    }, 400);
  }, []);

  useEffect(() => {
    checkEmail(state.creatorEmail);
    return () => { if (emailDebounceRef.current) clearTimeout(emailDebounceRef.current); };
  }, [state.creatorEmail, checkEmail]);

  useEffect(() => {
    checkPhone(state.creatorPhoneCountryCode, state.creatorPhoneNumber);
    return () => { if (phoneDebounceRef.current) clearTimeout(phoneDebounceRef.current); };
  }, [state.creatorPhoneCountryCode, state.creatorPhoneNumber, checkPhone]);

  const emailOk = state.creatorEmail.trim() === '' || emailStatus === 'available';
  const phoneOk = state.creatorPhoneNumber.trim() === '' || phoneStatus === 'available';
  const canContinue = emailOk && phoneOk && emailStatus !== 'checking' && phoneStatus !== 'checking';

  const handleContinue = () => {
    if (!canContinue) { haptic('error'); return; }
    haptic('light');
    onNext();
  };

  const renderEmailStatus = () => {
    switch (emailStatus) {
      case 'checking':
        return <View style={styles.statusRow}><ActivityIndicator size="small" color="#888888" /><Text variant="small" style={styles.statusMuted}>{t('creatorAccountSetup.emailChecking')}</Text></View>;
      case 'available':
        return <View style={styles.statusRow}><CheckCircle size={16} color="#FFFFFF" strokeWidth={2.25} /><Text variant="small" style={styles.statusWhite}>{t('creatorAccountSetup.emailAvailable')}</Text></View>;
      case 'taken':
        return <View style={styles.statusRow}><XCircle size={16} color="#888888" strokeWidth={2.25} /><Text variant="small" style={styles.statusMuted}>{t('creatorAccountSetup.emailTaken')}</Text></View>;
      case 'invalid':
        return <View style={styles.statusRow}><XCircle size={16} color="#888888" strokeWidth={2.25} /><Text variant="small" style={styles.statusMuted}>{t('creatorAccountSetup.emailInvalid')}</Text></View>;
      default: return null;
    }
  };

  const emailBorder = emailStatus === 'available' ? '#FFFFFF' : emailStatus === 'taken' || emailStatus === 'invalid' ? '#888888' : '#222222';

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      bottomOffset={16}
      showsVerticalScrollIndicator={false}
    >
      <Text variant="h2" style={styles.title}>{t('creatorAccountSetup.title')}</Text>
      <Text variant="body" style={styles.subtitle}>{t('creatorAccountSetup.subtitle')}</Text>

      {apiError && (
        <View style={styles.errorBanner}>
          <AlertCircle size={20} color="#FFFFFF" strokeWidth={2.25} />
          <Text variant="small" style={styles.errorBannerText}>{apiError}</Text>
        </View>
      )}

      <View style={styles.formArea}>
        {/* Creator Name (read-only) */}
        <View>
          <Text variant="small" style={styles.label}>{t('creatorAccountSetup.nameLabel')}</Text>
          <View style={[styles.inputWrapper, styles.readOnlyInput]}>
            <TextInput
              value={state.creatorName}
              editable={false}
              style={[styles.textInput, styles.readOnlyText]}
            />
          </View>
        </View>

        {/* Email (optional) */}
        <View>
          <Text variant="small" style={styles.label}>{t('creatorAccountSetup.emailLabel')}</Text>
          <View style={[styles.inputWrapper, { borderColor: emailBorder }]}>
            <TextInput
              value={state.creatorEmail}
              onChangeText={(v) => dispatch({ type: 'UPDATE_FIELD', field: 'creatorEmail', value: v.trim() })}
              placeholder={t('creatorAccountSetup.emailPlaceholder')}
              placeholderTextColor="#666666"
              style={styles.textInput}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              keyboardType="email-address"
            />
            {emailStatus === 'available' && <CheckCircle size={20} color="#FFFFFF" strokeWidth={2.25} />}
            {(emailStatus === 'taken' || emailStatus === 'invalid') && <XCircle size={20} color="#888888" strokeWidth={2.25} />}
            {emailStatus === 'checking' && <ActivityIndicator size="small" color="#888888" />}
          </View>
          {renderEmailStatus()}
        </View>

        {/* Phone (optional) */}
        <View>
          <Text variant="small" style={styles.label}>{t('creatorAccountSetup.phoneLabel')}</Text>
          <PhoneInput
            countryCode={state.creatorPhoneCountryCode}
            phoneNumber={state.creatorPhoneNumber}
            onCountryCodeChange={(v) => dispatch({ type: 'UPDATE_FIELD', field: 'creatorPhoneCountryCode', value: v })}
            onPhoneNumberChange={(v) => dispatch({ type: 'UPDATE_FIELD', field: 'creatorPhoneNumber', value: v })}
          />
          {phoneStatus === 'checking' && (
            <View style={styles.statusRow}><ActivityIndicator size="small" color="#888888" /><Text variant="small" style={styles.statusMuted}>{t('creatorAccountSetup.emailChecking')}</Text></View>
          )}
          {phoneStatus === 'taken' && (
            <View style={styles.statusRow}><XCircle size={16} color="#888888" strokeWidth={2.25} /><Text variant="small" style={styles.statusMuted}>{t('creatorAccountSetup.phoneTaken')}</Text></View>
          )}
          {phoneStatus === 'available' && (
            <View style={styles.statusRow}><CheckCircle size={16} color="#FFFFFF" strokeWidth={2.25} /><Text variant="small" style={styles.statusWhite}>{t('creatorAccountSetup.emailAvailable')}</Text></View>
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
  label: { color: '#888888', marginBottom: 6 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111111', borderRadius: 8, borderWidth: 1, borderColor: '#222222', paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  readOnlyInput: { backgroundColor: '#0A0A0A', borderColor: '#1A1A1A' },
  readOnlyText: { color: '#888888' },
  textInput: { color: '#FFFFFF', fontSize: 16, fontFamily: 'Archivo_400Regular', padding: 0, flex: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  statusMuted: { color: '#888888' },
  statusWhite: { color: '#FFFFFF' },
});
