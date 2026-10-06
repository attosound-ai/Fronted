import { useCallback, useRef, useState } from 'react';
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
import { useAppIconResync } from '../hooks/useAppIconResync';
import { useAppIconStore } from '../stores/appIconStore';
import { appIconService } from '../services/appIconService';
import { getNativeAppIcon, setNativeAppIconWithReason } from '../lib/nativeIcon';
import { isAlreadyOnPhone, resolveAttempt, slotFromNative } from '../lib/appIconModel';
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

  // One change at a time. Only the tapped tile used to be disabled, so a second
  // tile could be tapped while the first change was still being confirmed. Our
  // own check then saw the SECOND icon, reported the first as blocked by iOS
  // ("restart your iPhone", a false alarm: 6 of 6 failures on record were this)
  // and put the picker back on a stale choice.
  const inFlight = useRef(false);

  // The phone decides what is selected, not what the app remembers. Asked every
  // time the sheet opens, so a drifted memory heals itself on sight.
  useAppIconResync(visible);

  const handleSelect = useCallback(
    async (slot: AppIconSlot, displayName: string) => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        // A tap does nothing only when the PHONE already shows that icon. It
        // used to compare with the remembered choice, so with the two out of
        // step, tapping the icon the app believed active just closed the sheet
        // (client, Oct 6 2026: "I can't change my app icon back").
        const phoneBefore = slotFromNative(await getNativeAppIcon());
        if (isAlreadyOnPhone(slot, phoneBefore)) {
          setSelectedSlot(phoneBefore);
          onClose();
          return;
        }

        setBusySlot(slot ?? PENDING_NONE);
        haptic('light');
        // Optimistic, so the tile reads as chosen while the system works.
        setSelectedSlot(slot);

        const outcome = await setNativeAppIconWithReason(slot);

        // Whatever the native call reported, look at the phone and show that.
        const phoneNow = slotFromNative(await getNativeAppIcon());
        const result = resolveAttempt(slot, phoneNow);
        setSelectedSlot(result.selected);
        setBusySlot(null);

        if (!result.applied) {
          const reason = outcome.ok ? 'not_applied' : outcome.reason;
          // Full native diagnostic payload goes to PostHog so an OS level
          // rejection can be told apart without a device side debugger.
          analytics.capture(ANALYTICS_EVENTS.PROFILE.APP_ICON_CHANGE_FAILED, {
            slot_name: slot,
            stage: 'native_set',
            reason,
            phone_before: phoneBefore ?? 'default',
            phone_now: phoneNow ?? 'default',
            ...(outcome.ok ? {} : (outcome.diag ?? {})),
          });
          // iOS LSIconAlertManager regressions (iOS 18+/26, Apple Forum thread
          // 812125): the only known recovery is a device reboot.
          const isOsRejection =
            reason === 'eagain' ||
            reason === 'silent_rollback' ||
            reason === 'native_error' ||
            reason === 'not_applied';
          const toastKey = isOsRejection
            ? 'appIcon.errorChangeReboot'
            : 'appIcon.errorChange';
          const fallback = isOsRejection
            ? 'iOS is blocking the icon change. Try restarting your iPhone.'
            : "Couldn't change icon";
          showToast(t(toastKey, { defaultValue: fallback }));
          return;
        }

        analytics.capture(ANALYTICS_EVENTS.PROFILE.APP_ICON_CHANGED, {
          slot_name: slot,
          display_name: displayName,
          phone_before: phoneBefore ?? 'default',
          // The native check can still say "failed" for a change that applied;
          // kept so that disagreement stays visible.
          native_reported: outcome.ok ? 'ok' : outcome.reason,
        });

        // Sync the server in the background. Failures here are non fatal: the
        // OS already has the new icon; only cross device sync is lost.
        appIconService.setMine(slot).catch(() => {
          analytics.capture(ANALYTICS_EVENTS.PROFILE.APP_ICON_CHANGE_FAILED, {
            slot_name: slot,
            stage: 'server_sync',
          });
        });

        onClose();
      } finally {
        inFlight.current = false;
      }
    },
    [onClose, setSelectedSlot, t]
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
            locked={busySlot !== null}
            onPress={() => handleSelect(null, t('appIcon.defaultLabel'))}
          />
          {icons.map((icon) => (
            <IconTile
              key={icon.slotName}
              icon={icon}
              isSelected={selectedSlot === icon.slotName}
              isBusy={busySlot === icon.slotName}
              locked={busySlot !== null}
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
  /** A change is in flight somewhere in the grid: no tile takes taps. */
  locked: boolean;
  onPress: () => void;
}

function DefaultTile({ label, isSelected, isBusy, locked, onPress }: DefaultTileProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={locked}
      style={[styles.tile, isBusy && styles.tileBusy]}
    >
      <Image source={DEFAULT_ICON_SOURCE} style={styles.tilePreview} resizeMode="cover" />
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
  /** A change is in flight somewhere in the grid: no tile takes taps. */
  locked: boolean;
  onPress: () => void;
}

function IconTile({ icon, isSelected, isBusy, locked, onPress }: IconTileProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={locked}
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
