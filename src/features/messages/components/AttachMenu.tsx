import { useCallback, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '@/constants/theme';
import { haptic } from '@/lib/haptics/hapticService';

export type AttachAction =
  | 'camera'
  | 'photos'
  | 'video_note'
  | 'voice'
  | 'file'
  | 'contact'
  | 'location'
  | 'project_audio';

// A real UIButton carrying a UIMenu: the same list iMessage, WhatsApp and
// Telegram open from the "+". The system draws the blur, the highlight, the
// haptic and the dismissal, so nothing of ours can sit unreadable over the
// wallpaper. Absent outside iOS, where a plain sheet takes over.
const ContextMenuButton =
  Platform.OS === 'ios'
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('react-native-ios-context-menu').ContextMenuButton as React.ComponentType<
        Record<string, unknown>
      >)
    : null;

interface MenuRow {
  action: AttachAction;
  label: string;
  /** SF Symbol drawn by UIKit itself. */
  symbol: string;
  soon?: boolean;
}

interface AttachMenuButtonProps {
  onPick: (action: AttachAction) => void;
  /** Fires when the native menu opens or closes, to turn the plus into an X. */
  onOpenChange?: (open: boolean) => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  children: React.ReactNode;
}

function useRows(): MenuRow[] {
  const { t } = useTranslation('messages');
  return useMemo(() => {
    const soon = t('attachMenu.soon');
    return [
      { action: 'camera', label: t('attachMenu.camera'), symbol: 'camera.fill' },
      { action: 'photos', label: t('attachMenu.photos'), symbol: 'photo.on.rectangle' },
      {
        action: 'video_note',
        label: t('attachMenu.videoNote'),
        symbol: 'video.circle.fill',
      },
      { action: 'voice', label: t('attachMenu.voice'), symbol: 'mic.fill' },
      { action: 'file', label: t('attachMenu.file'), symbol: 'doc.fill' },
      {
        action: 'contact',
        label: t('attachMenu.contact'),
        symbol: 'person.crop.circle.fill',
      },
      {
        action: 'project_audio',
        label: `${t('attachMenu.projectAudio')} (${soon})`,
        symbol: 'music.note',
        soon: true,
      },
      {
        action: 'location',
        label: `${t('attachMenu.location')} (${soon})`,
        symbol: 'location.fill',
        soon: true,
      },
    ];
  }, [t]);
}

function toMenuItem(row: MenuRow) {
  return {
    actionKey: row.action,
    actionTitle: row.label,
    icon: { type: 'IMAGE_SYSTEM', imageValue: { systemName: row.symbol } },
    ...(row.soon ? { menuAttributes: ['disabled'] } : null),
  };
}

/**
 * The "+" of the composer. Its children are the button itself (our glass
 * circle); the list that drops out of it is the system's own menu.
 */
export function AttachMenuButton({
  onPick,
  onOpenChange,
  style,
  accessibilityLabel,
  children,
}: AttachMenuButtonProps) {
  const { t } = useTranslation('messages');
  const rows = useRows();
  const [fallbackOpen, setFallbackOpen] = useState(false);

  const menuConfig = useMemo(() => {
    const main = rows.filter((row) => !row.soon).map(toMenuItem);
    const later = rows.filter((row) => row.soon).map(toMenuItem);
    return {
      menuTitle: '',
      menuItems: [
        ...main,
        // A second inline section: the system draws the separator, the way
        // iMessage separates its apps from the rest.
        { menuTitle: '', menuOptions: ['displayInline'], menuItems: later },
      ],
    };
  }, [rows]);

  const pick = useCallback(
    (action: AttachAction) => {
      haptic('light');
      onPick(action);
    },
    [onPick]
  );

  if (ContextMenuButton) {
    return (
      <ContextMenuButton
        style={style}
        isMenuPrimaryAction
        menuConfig={menuConfig}
        onMenuWillShow={() => onOpenChange?.(true)}
        onMenuWillHide={() => onOpenChange?.(false)}
        onPressMenuItem={({ nativeEvent }: { nativeEvent: { actionKey: string } }) =>
          pick(nativeEvent.actionKey as AttachAction)
        }
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        {children}
      </ContextMenuButton>
    );
  }

  // Android and web: one plain list, since there is no UIMenu to borrow.
  return (
    <>
      <Pressable
        style={style}
        onPress={() => {
          setFallbackOpen(true);
          onOpenChange?.(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        {children}
      </Pressable>
      <Modal
        visible={fallbackOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setFallbackOpen(false);
          onOpenChange?.(false);
        }}
      >
        <Pressable
          style={styles.backdrop}
          accessibilityLabel={t('attachMenu.close')}
          onPress={() => {
            setFallbackOpen(false);
            onOpenChange?.(false);
          }}
        >
          <View style={styles.panel}>
            {rows.map((row) => (
              <Pressable
                key={row.action}
                disabled={row.soon}
                onPress={() => {
                  setFallbackOpen(false);
                  onOpenChange?.(false);
                  pick(row.action);
                }}
                style={styles.row}
              >
                <Text style={[styles.label, row.soon && styles.labelSoon]}>
                  {row.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  panel: {
    backgroundColor: '#17171A',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingVertical: 8,
  },
  row: { height: 52, justifyContent: 'center', paddingHorizontal: 20 },
  label: { color: COLORS.white, fontSize: 16, fontFamily: 'Archivo_500Medium' },
  labelSoon: { color: '#7A7A80' },
});
