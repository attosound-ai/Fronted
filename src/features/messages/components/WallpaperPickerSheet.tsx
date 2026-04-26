import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Check, X } from 'lucide-react-native';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Text } from '@/components/ui/Text';
import { haptic } from '@/lib/haptics/hapticService';
import { useChatWallpapers } from '../hooks/useChatWallpapers';
import {
  CHAT_WALLPAPER_NONE_ID,
  useChatWallpaperStore,
} from '@/stores/chatWallpaperStore';
import type { ChatWallpaper } from '../types';

interface WallpaperPickerSheetProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Bottom sheet letting the user browse and pick a chat wallpaper.
 *
 * Data comes from `useChatWallpapers` (remote, cached). The "None" option
 * is rendered client-side as the first tile because the server only stores
 * real wallpapers — "none" is the absence of selection.
 *
 * Selection is a global preference persisted via `useChatWallpaperStore`.
 */
export function WallpaperPickerSheet({ visible, onClose }: WallpaperPickerSheetProps) {
  const { t } = useTranslation('messages');
  const { data: wallpapers = [], isLoading, isError } = useChatWallpapers();
  const selectedId = useChatWallpaperStore((s) => s.selectedWallpaperId);
  const setSelectedId = useChatWallpaperStore((s) => s.setSelectedWallpaperId);

  const handleSelect = useCallback(
    (id: string | null) => {
      haptic('light');
      setSelectedId(id);
    },
    [setSelectedId]
  );

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('wallpaperPicker.title')}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>
          {t('wallpaperPicker.subtitle')}
        </Text>

        <View style={styles.grid}>
          {/* "None" option — explicit opt-out from wallpaper. */}
          <NoneTile
            label={t('wallpaperPicker.noneLabel')}
            isSelected={selectedId === CHAT_WALLPAPER_NONE_ID}
            onPress={() => handleSelect(CHAT_WALLPAPER_NONE_ID)}
          />

          {wallpapers.map((w) => (
            <WallpaperTile
              key={w.id}
              wallpaper={w}
              isSelected={selectedId === w.id}
              onPress={() => handleSelect(w.id)}
            />
          ))}
        </View>

        {isLoading && wallpapers.length === 0 && (
          <Text style={styles.statusText}>{t('wallpaperPicker.loading')}</Text>
        )}

        {isError && (
          <Text style={styles.errorText}>
            {t('wallpaperPicker.error')}
          </Text>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

// ── Tiles ─────────────────────────────────────────────────────────────

interface NoneTileProps {
  label: string;
  isSelected: boolean;
  onPress: () => void;
}

function NoneTile({ label, isSelected, onPress }: NoneTileProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tile, isSelected && styles.tileSelected]}
    >
      <View style={styles.noneTileInner}>
        <X size={28} color="#666" strokeWidth={1.75} />
      </View>
      <Text style={styles.tileLabel}>{label}</Text>
      {isSelected && (
        <View style={styles.checkBadge}>
          <Check size={14} color="#FFFFFF" strokeWidth={3} />
        </View>
      )}
    </Pressable>
  );
}

interface WallpaperTileProps {
  wallpaper: ChatWallpaper;
  isSelected: boolean;
  onPress: () => void;
}

function WallpaperTile({ wallpaper, isSelected, onPress }: WallpaperTileProps) {
  const previewUri = wallpaper.thumbnailUrl || wallpaper.imageUrl;
  const overlayOpacity = wallpaper.overlayOpacity ?? 0.5;

  return (
    <Pressable
      onPress={onPress}
      style={[styles.tile, isSelected && styles.tileSelected]}
    >
      <ImageBackground
        source={{ uri: previewUri }}
        style={styles.tilePreview}
        imageStyle={styles.tilePreviewImage}
        resizeMode="repeat"
      >
        <View
          style={[
            styles.tileOverlay,
            { backgroundColor: `rgba(0,0,0,${overlayOpacity})` },
          ]}
        />
        <Image
          source={{ uri: previewUri }}
          style={styles.tilePreviewSample}
          resizeMode="contain"
        />
      </ImageBackground>
      <Text style={styles.tileLabel} numberOfLines={1}>
        {wallpaper.name}
      </Text>
      {isSelected && (
        <View style={styles.checkBadge}>
          <Check size={14} color="#FFFFFF" strokeWidth={3} />
        </View>
      )}
    </Pressable>
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
  tileSelected: {
    opacity: 1,
  },
  tilePreview: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#222',
  },
  tilePreviewImage: {
    borderRadius: 16,
  },
  tileOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
  },
  tilePreviewSample: {
    width: 52,
    height: 52,
    opacity: 0.85,
  },
  noneTileInner: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: 16,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#222',
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
