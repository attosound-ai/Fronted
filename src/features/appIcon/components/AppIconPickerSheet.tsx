import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';

// Static require of the primary app icon — bundled in the binary at build
// time so the Default tile shows the actual icon the user has on their
// home screen right now, not a generic placeholder.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const DEFAULT_ICON_SOURCE = require('../../../../assets/icon.png');
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Text } from '@/components/ui/Text';
import { showToast } from '@/components/ui/Toast';
import { haptic } from '@/lib/haptics/hapticService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { useAppIcons } from '../hooks/useAppIcons';
import { useAppIconStore } from '../stores/appIconStore';
import { appIconService } from '../services/appIconService';
import { setNativeAppIconWithReason } from '../lib/nativeIcon';
import type { AppIcon, AppIconSlot } from '../types';

interface AppIconPickerSheetProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Bottom sheet that lets the user pick a home-screen app icon. The catalog
 * (`useAppIcons`) is fetched from the backend, but the icon BITMAPS live in
 * the binary — the catalog tells us which slot names are advertised + their
 * display name + thumbnail. Calling {@link setNativeAppIcon} flips the OS
 * launcher icon; the success/failure handler keeps the local store and the
 * server-side preference in sync.
 *
 * The "Default" tile is rendered client-side (the server never stores the
 * primary icon — its absence is what "default" means).
 */
export function AppIconPickerSheet({ visible, onClose }: AppIconPickerSheetProps) {
  const { t } = useTranslation('profile');
  const { data: icons = [], isLoading, isError } = useAppIcons();
  const selectedSlot = useAppIconStore((s) => s.selectedSlot);
  const setSelectedSlot = useAppIconStore((s) => s.setSelectedSlot);
  const [busySlot, setBusySlot] = useState<AppIconSlot | typeof PENDING_NONE | null>(
    null
  );

  const handleSelect = useCallback(
    async (slot: AppIconSlot, displayName: string) => {
      // Already on this icon? Just dismiss.
      if (slot === selectedSlot) {
        onClose();
        return;
      }

      const busyKey = slot ?? PENDING_NONE;
      setBusySlot(busyKey);
      haptic('light');

      // Optimistic local update so the picker reflects the choice
      // immediately, even before the OS / network confirm.
      const previous = selectedSlot;
      setSelectedSlot(slot);

      const outcome = await setNativeAppIconWithReason(slot);

      if (!outcome.ok) {
        // Revert the picker, leave the toast, and bail out before hitting
        // the server. We never want the server preference to diverge from
        // what the OS is actually showing.
        setSelectedSlot(previous);
        setBusySlot(null);
        // Full native diagnostic payload goes to PostHog so we can root-cause
        // OS-level rejections (NSError domain/code, pre/post alternate icon
        // state, asset catalog vs Info.plist registration) without needing a
        // device-side debugger. Picker is fail-closed; data is opt-in via
        // existing analytics consent.
        analytics.capture(ANALYTICS_EVENTS.PROFILE.APP_ICON_CHANGE_FAILED, {
          slot_name: slot,
          stage: 'native_set',
          reason: outcome.reason,
          ...(outcome.diag ?? {}),
        });
        // iOS LSIconAlertManager regressions (iOS 18+/26, Apple Forum thread
        // 812125): the only known recovery is a device reboot. We treat three
        // flavors as "the OS rejected the swap" — EAGAIN, silent rollback
        // (SpringBoard accepts then reverts during commit), and the legacy
        // `native_error` bucket (the unpatched plugin only said "false").
        const isOsRejection =
          outcome.reason === 'eagain' ||
          outcome.reason === 'silent_rollback' ||
          outcome.reason === 'native_error';
        const toastKey = isOsRejection ? 'appIcon.errorChangeReboot' : 'appIcon.errorChange';
        const fallback = isOsRejection
          ? "iOS is blocking the icon change. Try restarting your iPhone."
          : "Couldn't change icon";
        showToast(t(toastKey, { defaultValue: fallback }));
        return;
      }

      analytics.capture(ANALYTICS_EVENTS.PROFILE.APP_ICON_CHANGED, {
        slot_name: slot,
        display_name: displayName,
      });

      // Sync the server in the background — failures here are non-fatal:
      // the OS already has the new icon; we just lose cross-device sync
      // for this change until the next reconciliation.
      appIconService.setMine(slot).catch(() => {
        analytics.capture(ANALYTICS_EVENTS.PROFILE.APP_ICON_CHANGE_FAILED, {
          slot_name: slot,
          stage: 'server_sync',
        });
      });

      setBusySlot(null);
      onClose();
    },
    [onClose, selectedSlot, setSelectedSlot, t]
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('appIcon.title')}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>{t('appIcon.subtitle')}</Text>

        <View style={styles.grid}>
          <DefaultTile
            label={t('appIcon.defaultLabel')}
            isSelected={selectedSlot === null}
            isBusy={busySlot === PENDING_NONE}
            onPress={() => handleSelect(null, t('appIcon.defaultLabel'))}
          />
          {icons.map((icon) => (
            <IconTile
              key={icon.slotName}
              icon={icon}
              isSelected={selectedSlot === icon.slotName}
              isBusy={busySlot === icon.slotName}
              onPress={() => handleSelect(icon.slotName, icon.name)}
            />
          ))}
        </View>

        {isLoading && icons.length === 0 && (
          <Text style={styles.statusText}>{t('appIcon.loading')}</Text>
        )}
        {isError && <Text style={styles.errorText}>{t('appIcon.error')}</Text>}
      </ScrollView>
    </BottomSheet>
  );
}

// ── Tiles ────────────────────────────────────────────────────────────

const PENDING_NONE = '__default__';

interface DefaultTileProps {
  label: string;
  isSelected: boolean;
  isBusy: boolean;
  onPress: () => void;
}

function DefaultTile({ label, isSelected, isBusy, onPress }: DefaultTileProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={isBusy}
      style={[styles.tile, isBusy && styles.tileBusy]}
    >
      <Image
        source={DEFAULT_ICON_SOURCE}
        style={styles.tilePreview}
        resizeMode="cover"
      />
      <Text style={styles.tileLabel} numberOfLines={1}>
        {label}
      </Text>
      {isSelected && <SelectedBadge />}
    </Pressable>
  );
}

interface IconTileProps {
  icon: AppIcon;
  isSelected: boolean;
  isBusy: boolean;
  onPress: () => void;
}

function IconTile({ icon, isSelected, isBusy, onPress }: IconTileProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={isBusy}
      style={[styles.tile, isBusy && styles.tileBusy]}
    >
      <Image
        source={{ uri: icon.previewUrl }}
        style={styles.tilePreview}
        resizeMode="cover"
      />
      <Text style={styles.tileLabel} numberOfLines={1}>
        {icon.name}
      </Text>
      {isSelected && <SelectedBadge />}
    </Pressable>
  );
}

function SelectedBadge() {
  return (
    <View style={styles.checkBadge}>
      <Check size={14} color="#FFFFFF" strokeWidth={3} />
    </View>
  );
}

const TILE_SIZE = 104;

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  subtitle: {
    color: '#888',
    fontFamily: 'Archivo_400Regular',
    fontSize: 13,
    marginBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  tile: {
    width: TILE_SIZE,
    alignItems: 'center',
    gap: 6,
  },
  tileBusy: {
    opacity: 0.5,
  },
  tilePreview: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: 22,
    backgroundColor: '#111',
    borderWidth: 1.5,
    borderColor: '#222',
  },
  defaultTilePreview: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    color: '#AAA',
    fontFamily: 'Archivo_500Medium',
    fontSize: 12,
    textAlign: 'center',
  },
  checkBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#000',
  },
  statusText: {
    color: '#666',
    fontFamily: 'Archivo_400Regular',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 16,
  },
  errorText: {
    color: '#EF4444',
    fontFamily: 'Archivo_400Regular',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 16,
  },
});
