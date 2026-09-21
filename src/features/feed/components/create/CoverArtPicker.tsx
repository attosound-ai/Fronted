import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { ImagePlus, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui/Text';
import { haptic } from '@/lib/haptics/hapticService';

interface Props {
  /** Local image uri, or null when the post has no cover. */
  uri: string | null;
  onPick: () => void;
  onRemove: () => void;
  busy?: boolean;
}

/**
 * The optional cover of an audio post. Empty it is a dashed square inviting
 * one; filled it shows the artwork with a remove button, so the person can
 * always go back to a post with no cover.
 */
export function CoverArtPicker({ uri, onPick, onRemove, busy = false }: Props) {
  const { t } = useTranslation('feed');
  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => {
          if (busy) return;
          void haptic('light');
          onPick();
        }}
        accessibilityRole="button"
        accessibilityLabel={uri ? t('create.coverChange') : t('create.coverAdd')}
        style={({ pressed }) => [
          styles.square,
          !uri && styles.squareEmpty,
          pressed && styles.pressed,
        ]}
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : uri ? (
          <Image source={{ uri }} style={styles.image} />
        ) : (
          <ImagePlus size={22} color="#888888" strokeWidth={2} />
        )}
      </Pressable>

      <View style={styles.copy}>
        <Text variant="body" style={styles.title}>
          {t('create.coverTitle')}
        </Text>
        <Text variant="caption" style={styles.subtitle}>
          {uri ? t('create.coverSet') : t('create.coverHint')}
        </Text>
      </View>

      {uri && !busy && (
        <Pressable
          onPress={() => {
            void haptic('light');
            onRemove();
          }}
          accessibilityRole="button"
          accessibilityLabel={t('create.coverRemove')}
          hitSlop={10}
          style={styles.remove}
        >
          <X size={16} color="#FFFFFF" strokeWidth={2.5} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#141414',
  },
  square: {
    width: 56,
    height: 56,
    borderRadius: 8,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1F1F1F',
  },
  squareEmpty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#3A3A3A',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  copy: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    color: '#FFFFFF',
  },
  subtitle: {
    color: '#888888',
    marginTop: 2,
  },
  remove: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2A2A2A',
  },
  pressed: {
    opacity: 0.8,
  },
});
