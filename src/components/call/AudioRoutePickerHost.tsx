import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Headphones, Smartphone, Volume2, Check } from 'lucide-react-native';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { useCallStore } from '@/stores/callStore';
import { selectAudioRoute, getBluetoothDeviceName } from '@/hooks/useTwilioVoice';
import { getCallAudioState } from '@/lib/telemetry/deviceSnapshot';
import { COLORS, SPACING } from '@/constants/theme';

type RouteTarget = 'bluetooth' | 'earpiece' | 'speaker';

/**
 * Global host for the in-call audio ROUTE PICKER sheet (b155) — the three REAL
 * output choices: Bluetooth device / earpiece / speaker. Exists because neither
 * predecessor could offer all three:
 *  - the old ActionSheetIOS picker (pre-b98) silently failed to present over
 *    the recording screen's bottom sheets;
 *  - the system AVRoutePickerView (b151-154) lists DEVICES, not ports, so with
 *    a speaker override active the earpiece option does not exist in it.
 * Mounted once at the root next to DtmfKeypadHost — the same pattern, which
 * demonstrably presents over every call surface including the recorder.
 */
export function AudioRoutePickerHost() {
  const { t } = useTranslation('calls');
  const visible = useCallStore((s) => s.routePickerVisible);
  const hide = useCallStore((s) => s.hideRoutePicker);

  const [btName, setBtName] = useState<string | null>(null);
  const [current, setCurrent] = useState<RouteTarget | null>(null);

  // Snapshot the live route + BT device name each time the sheet opens, so the
  // checkmark reflects the ACTUAL output (native truth), not our optimistic state.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void (async () => {
      const [name, live] = await Promise.all([
        getBluetoothDeviceName(),
        getCallAudioState(),
      ]);
      if (cancelled) return;
      setBtName(name);
      const port = live?.liveOutputPort ?? '';
      setCurrent(
        port.startsWith('Bluetooth')
          ? 'bluetooth'
          : port === 'Speaker'
            ? 'speaker'
            : port === 'Receiver'
              ? 'earpiece'
              : null
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const pick = (target: RouteTarget) => {
    hide();
    void selectAudioRoute(target);
  };

  const Row = ({
    target,
    icon,
    label,
  }: {
    target: RouteTarget;
    icon: React.ReactNode;
    label: string;
  }) => (
    <TouchableOpacity style={styles.row} onPress={() => pick(target)} activeOpacity={0.7}>
      {icon}
      <Text style={styles.label} numberOfLines={1} maxFontSizeMultiplier={1.2}>
        {label}
      </Text>
      {current === target ? <Check size={20} color={COLORS.primary} /> : null}
    </TouchableOpacity>
  );

  return (
    <BottomSheet visible={visible} onClose={hide} title={t('routePicker.title', 'Audio')}>
      <View style={styles.body}>
        {btName ? (
          <Row
            target="bluetooth"
            icon={<Headphones size={22} color="#fff" />}
            label={btName}
          />
        ) : null}
        <Row
          target="earpiece"
          icon={<Smartphone size={22} color="#fff" />}
          label={t('routePicker.earpiece', 'iPhone')}
        />
        <Row
          target="speaker"
          icon={<Volume2 size={22} color="#fff" />}
          label={t('routePicker.speaker', 'Speaker')}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
    gap: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: SPACING.lg,
  },
  label: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Archivo_500Medium',
  },
});
