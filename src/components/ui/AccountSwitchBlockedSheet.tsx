import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { Text } from './Text';
import { useAccountSwitchPromptStore } from '@/stores/accountSwitchPromptStore';

/**
 * Global host for the "you're on a call, choose what to do" prompt. Mounted once
 * in the root layout. Opens whenever a switch is blocked by an active call (from
 * either the double-tap gesture or the switcher bottom sheet), so the user
 * always sees WHY the switch didn't happen and can decide: end the call and
 * switch, or stay on the call.
 */
export function AccountSwitchBlockedSheet() {
  const { t } = useTranslation('profile');
  const pending = useAccountSwitchPromptStore((s) => s.pending);
  const busy = useAccountSwitchPromptStore((s) => s.busy);
  const dismiss = useAccountSwitchPromptStore((s) => s.dismiss);
  const confirm = useAccountSwitchPromptStore((s) => s.confirmEndCallAndSwitch);

  const visible = pending != null;

  return (
    <BottomSheet
      visible={visible}
      onClose={dismiss}
      title={t('accountSwitcher.onCallTitle')}
    >
      <View style={styles.body}>
        <Text style={styles.message}>
          {t('accountSwitcher.onCallBody', {
            username: pending?.targetUsername ?? '',
          })}
        </Text>

        <Button
          title={t('accountSwitcher.endCallAndSwitch')}
          onPress={confirm}
          loading={busy}
          variant="primary"
          size="lg"
        />
        <Button
          title={t('accountSwitcher.stayOnCall')}
          onPress={dismiss}
          disabled={busy}
          variant="ghost"
          size="lg"
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingTop: 4,
    paddingBottom: 12,
    gap: 10,
  },
  message: {
    color: '#888888',
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Archivo_400Regular',
    paddingHorizontal: 4,
    marginBottom: 6,
  },
});
