import { useCallback, useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { router } from 'expo-router';
import { LayoutList, Settings } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { CounterBadge } from '@/components/ui/CounterBadge';
import { COLORS, SPACING } from '@/constants/theme';
import { haptic } from '@/lib/haptics/hapticService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { useThreadsInbox } from '../hooks/useThreadsInbox';
import {
  useConversationViewStore,
  type ConversationView,
} from '../stores/conversationViewStore';
import { WallpaperPickerSheet } from './WallpaperPickerSheet';

// A real UIButton carrying a UIMenu, the same list the app's "+" opens in the
// composer. The system draws the blur, the checkmark on the chosen row and
// the dismissal, so nothing of ours can drift from Apple's own menu.
const ContextMenuButton =
  Platform.OS === 'ios'
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('react-native-ios-context-menu').ContextMenuButton as React.ComponentType<
        Record<string, unknown>
      >)
    : null;

type ViewKey = ConversationView | 'threads';

interface ConversationsHeaderProps {
  /**
   * Optional style override for the header container View. Used when the
   * header is hosted inside CollapsibleHeader so it can stretch to full
   * width (flex: 1) and drop its own vertical padding (CollapsibleHeader's
   * row already centres the content vertically).
   */
  containerStyle?: StyleProp<ViewStyle>;
}

/**
 * Header of the messages tab.
 *
 * Left: the views button, Slack's sidebar in one menu: all messages,
 * unread, threads, drafts, archived. The list itself stays the WhatsApp and Telegram
 * shape everybody already knows, so the Slack part is something you go and
 * ask for rather than something that greets you (David, Sep 24 2026).
 *
 * Right: the settings gear that opens the messages settings sheet. Today the
 * only setting is the chat wallpaper picker, so the sheet is rendered
 * directly; when more settings land, this can grow into a sub-menu.
 */
export function ConversationsHeader({ containerStyle }: ConversationsHeaderProps = {}) {
  const { t } = useTranslation('messages');
  const [wallpaperSheetVisible, setWallpaperSheetVisible] = useState(false);
  const view = useConversationViewStore((s) => s.view);
  const setView = useConversationViewStore((s) => s.setView);
  const { unreadTotal } = useThreadsInbox();

  const rows = useMemo(
    () =>
      [
        {
          key: 'all' as ViewKey,
          label: t('header.viewAll'),
          symbol: 'bubble.left.and.bubble.right',
        },
        {
          key: 'unread' as ViewKey,
          label: t('header.viewUnread'),
          symbol: 'circle.badge.fill',
        },
        {
          key: 'threads' as ViewKey,
          label: t('header.viewThreads'),
          symbol: 'text.bubble',
        },
        {
          key: 'drafts' as ViewKey,
          label: t('header.viewDrafts'),
          symbol: 'square.and.pencil',
        },
        {
          key: 'archived' as ViewKey,
          label: t('header.viewArchived'),
          symbol: 'archivebox',
        },
      ] as const,
    [t]
  );

  const pick = useCallback(
    (key: ViewKey) => {
      void haptic('selection');
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.VIEW_PICKED, { view: key });
      if (key === 'threads') {
        router.push('/threads');
        return;
      }
      setView(key);
    },
    [setView]
  );

  const menuConfig = useMemo(
    () => ({
      menuTitle: '',
      menuItems: rows.map((row) => ({
        actionKey: row.key,
        actionTitle: row.label,
        icon: { type: 'IMAGE_SYSTEM', imageValue: { systemName: row.symbol } },
        // The system draws the tick, so the chosen view is never in doubt.
        menuState: row.key === view ? 'on' : 'off',
      })),
    }),
    [rows, view]
  );

  const openFallbackMenu = useCallback(() => {
    void haptic('selection');
    const cancel = t('actions.cancel', { defaultValue: 'Cancel' });
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...rows.map((row) => row.label), cancel],
          cancelButtonIndex: rows.length,
          userInterfaceStyle: 'dark',
        },
        (index) => {
          if (index < rows.length) pick(rows[index].key);
        }
      );
      return;
    }
    Alert.alert(t('header.menuAccessibility'), undefined, [
      ...rows.map((row) => ({ text: row.label, onPress: () => pick(row.key) })),
      { text: cancel, style: 'cancel' as const },
    ]);
  }, [pick, rows, t]);

  const title =
    view === 'unread'
      ? t('header.titleUnread')
      : view === 'drafts'
        ? t('header.titleDrafts')
        : view === 'archived'
          ? t('header.titleArchived')
          : t('header.title');

  const button = (
    <View style={styles.viewsButton}>
      <LayoutList size={22} color={COLORS.white} strokeWidth={2} />
      {unreadTotal > 0 ? (
        <View style={styles.threadDot}>
          <CounterBadge
            count={unreadTotal}
            color={COLORS.white}
            textColor="#000000"
            fontWeight="semibold"
            size={16}
          />
        </View>
      ) : null}
    </View>
  );

  return (
    <>
      <View style={[styles.container, containerStyle]}>
        {ContextMenuButton ? (
          <ContextMenuButton
            style={styles.menuHost}
            isMenuPrimaryAction
            menuConfig={menuConfig}
            onPressMenuItem={({ nativeEvent }: { nativeEvent: { actionKey: string } }) =>
              pick(nativeEvent.actionKey as ViewKey)
            }
            accessible
            accessibilityRole="button"
            accessibilityLabel={t('header.menuAccessibility')}
          >
            {button}
          </ContextMenuButton>
        ) : (
          <Pressable
            onPress={openFallbackMenu}
            style={styles.menuHost}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('header.menuAccessibility')}
          >
            {button}
          </Pressable>
        )}

        <Text
          variant="h1"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          maxFontSizeMultiplier={1.0}
          style={styles.title}
        >
          {title}
        </Text>

        <TouchableOpacity
          onPress={() => setWallpaperSheetVisible(true)}
          style={styles.settingsButton}
          accessibilityRole="button"
          accessibilityLabel={t('header.settingsAccessibility')}
          hitSlop={8}
        >
          <Settings size={22} color={COLORS.white} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <WallpaperPickerSheet
        visible={wallpaperSheetVisible}
        onClose={() => setWallpaperSheetVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  title: { flex: 1 },
  menuHost: { padding: SPACING.xs },
  viewsButton: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  threadDot: { position: 'absolute', top: -7, right: -10 },
  settingsButton: {
    padding: SPACING.xs,
  },
});
