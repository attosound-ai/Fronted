import { useState } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Settings } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { COLORS, SPACING } from '@/constants/theme';
import { WallpaperPickerSheet } from './WallpaperPickerSheet';

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
 * Hosts a settings gear on the right that opens the global messages
 * settings sheet. Today the only setting is the chat wallpaper picker —
 * the sheet is rendered directly because there's nothing else to branch
 * on yet. When more settings land, this can grow into a sub-menu.
 */
export function ConversationsHeader({ containerStyle }: ConversationsHeaderProps = {}) {
  const { t } = useTranslation('messages');
  const [wallpaperSheetVisible, setWallpaperSheetVisible] = useState(false);

  return (
    <>
      <View style={[styles.container, containerStyle]}>
        <Text
          variant="h1"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          maxFontSizeMultiplier={1.0}
        >
          {t('header.title')}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  settingsButton: {
    padding: SPACING.xs,
  },
});
