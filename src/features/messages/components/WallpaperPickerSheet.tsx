import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, X } from 'lucide-react-native';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Text } from '@/components/ui/Text';
import { haptic } from '@/lib/haptics/hapticService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { useChatWallpapers } from '../hooks/useChatWallpapers';
import {
  CHAT_WALLPAPER_NONE_ID,
  useChatWallpaperStore,
} from '@/stores/chatWallpaperStore';
import { gradientStops } from './ChatWallpaperLayer';
import type { ChatWallpaper } from '../types';
import { COLORS } from '@/constants/theme';

type Scope = 'conversation' | 'all';

interface WallpaperPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  /**
   * When opened from inside a chat the picker can set the wallpaper for that
   * conversation only (WhatsApp and Telegram) or for every chat.
   */
  conversationId?: string | null;
}

/**
 * Bottom sheet letting the user browse and pick a chat wallpaper.
 *
 * Data comes from `useChatWallpapers` (remote, cached). The "None" option
 * is rendered client side as the first tile because the server only stores
 * real wallpapers: "none" is the absence of selection.
 */
export function WallpaperPickerSheet({
  visible,
  onClose,
  conversationId,
}: WallpaperPickerSheetProps) {
  const { t } = useTranslation('messages');
  const { data: wallpapers = [], isLoading, isError, refetch } = useChatWallpapers();
  const globalId = useChatWallpaperStore((s) => s.selectedWallpaperId);
  const perConversation = useChatWallpaperStore((s) => s.perConversation);
  const setGlobal = useChatWallpaperStore((s) => s.setSelectedWallpaperId);
  const setForConversation = useChatWallpaperStore((s) => s.setConversationWallpaperId);
  const [scope, setScope] = useState<Scope>(conversationId ? 'conversation' : 'all');

  useEffect(() => {
    if (!visible) return;
    setScope(conversationId ? 'conversation' : 'all');
    // The catalogue is admin managed: pull the latest each time it opens.
    void refetch();
    analytics.capture(ANALYTICS_EVENTS.MESSAGES.WALLPAPER_PICKER_OPENED, {
      from_conversation: !!conversationId,
      catalogue_size: wallpapers.length,
    });
    // Only on open: the catalogue size is informational.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, conversationId]);

  const selectedId =
    scope === 'conversation' && conversationId
      ? (perConversation[conversationId] ?? null)
      : globalId;

  const handleSelect = useCallback(
    (id: string | null, kind: string) => {
      haptic('light');
      if (scope === 'conversation' && conversationId) {
        setForConversation(conversationId, id);
      } else {
        setGlobal(id);
      }
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.WALLPAPER_CHANGED, {
        wallpaper_id: id ?? 'default',
        kind,
        scope,
        conversation_id: scope === 'conversation' ? conversationId : null,
      });
    },
    [scope, conversationId, setForConversation, setGlobal]
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('wallpaperPicker.title')}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {conversationId ? (
          <View style={styles.scopeRow}>
            <ScopeChip
              label={t('wallpaperPicker.scopeThisChat')}
              active={scope === 'conversation'}
              onPress={() => setScope('conversation')}
            />
            <ScopeChip
              label={t('wallpaperPicker.scopeAllChats')}
              active={scope === 'all'}
              onPress={() => setScope('all')}
            />
          </View>
        ) : null}
        <Text style={styles.subtitle}>
          {scope === 'conversation'
            ? t('wallpaperPicker.subtitleThisChat')
            : t('wallpaperPicker.subtitle')}
        </Text>

        <View style={styles.grid}>
          {scope === 'conversation' ? (
            <NoneTile
              label={t('wallpaperPicker.followGlobalLabel')}
              isSelected={selectedId === null}
              onPress={() => handleSelect(null, 'inherit')}
              variant="inherit"
            />
          ) : null}
          <NoneTile
            label={t('wallpaperPicker.noneLabel')}
            isSelected={selectedId === CHAT_WALLPAPER_NONE_ID}
            onPress={() => handleSelect(CHAT_WALLPAPER_NONE_ID, 'none')}
            variant="none"
          />

          {wallpapers.map((w) => (
            <WallpaperTile
              key={w.id}
              wallpaper={w}
              isSelected={selectedId === w.id}
              onPress={() => handleSelect(w.id, w.kind ?? 'image')}
            />
          ))}
        </View>

        {isLoading && wallpapers.length === 0 && (
          <Text style={styles.statusText}>{t('wallpaperPicker.loading')}</Text>
        )}

        {isError && <Text style={styles.errorText}>{t('wallpaperPicker.error')}</Text>}
      </ScrollView>
    </BottomSheet>
  );
}

function ScopeChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.scopeChip, active && styles.scopeChipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.scopeChipText, active && styles.scopeChipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

// ── Tiles ─────────────────────────────────────────────────────────────

interface NoneTileProps {
  label: string;
  isSelected: boolean;
  onPress: () => void;
  variant: 'none' | 'inherit';
}

function NoneTile({ label, isSelected, onPress, variant }: NoneTileProps) {
  return (
    <Pressable onPress={onPress} style={styles.tile}>
      <View style={[styles.noneTileInner, isSelected && styles.tilePreviewSelected]}>
        {variant === 'none' ? (
          <X size={28} color="#666" strokeWidth={1.75} />
        ) : (
          <Text style={styles.inheritGlyph}>↺</Text>
        )}
      </View>
      <Text style={styles.tileLabel} numberOfLines={1}>
        {label}
      </Text>
      {isSelected && <SelectedBadge />}
    </Pressable>
  );
}

interface WallpaperTileProps {
  wallpaper: ChatWallpaper;
  isSelected: boolean;
  onPress: () => void;
}

function WallpaperTile({ wallpaper, isSelected, onPress }: WallpaperTileProps) {
  const overlayOpacity = Math.min(wallpaper.overlayOpacity ?? 0.35, 0.45);
  const veil = (
    <View
      style={[styles.tileOverlay, { backgroundColor: `rgba(0,0,0,${overlayOpacity})` }]}
    />
  );

  let preview;
  const kind = wallpaper.kind ?? (wallpaper.imageUrl ? 'image' : 'gradient');
  if (kind === 'image') {
    const previewUri = wallpaper.thumbnailUrl || wallpaper.imageUrl;
    preview = (
      <ImageBackground
        source={{ uri: previewUri }}
        style={[styles.tilePreview, isSelected && styles.tilePreviewSelected]}
        imageStyle={styles.tilePreviewImage}
        resizeMode="repeat"
      >
        {veil}
        <Image
          source={{ uri: previewUri }}
          style={styles.tilePreviewSample}
          resizeMode="contain"
        />
      </ImageBackground>
    );
  } else {
    preview = (
      <View style={[styles.tilePreview, isSelected && styles.tilePreviewSelected]}>
        <LinearGradient
          colors={gradientStops(wallpaper.gradientColors, wallpaper.tintColor)}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        {kind === 'pattern' && wallpaper.patternUrl ? (
          <ImageBackground
            source={{ uri: wallpaper.patternUrl }}
            style={[
              StyleSheet.absoluteFillObject,
              { opacity: wallpaper.patternOpacity ?? 0.18 },
            ]}
            imageStyle={styles.tilePatternImage}
            resizeMode="repeat"
          />
        ) : null}
        {veil}
      </View>
    );
  }

  return (
    <Pressable onPress={onPress} style={styles.tile}>
      {preview}
      <Text style={styles.tileLabel} numberOfLines={1}>
        {wallpaper.name}
      </Text>
      {isSelected && <SelectedBadge />}
    </Pressable>
  );
}

function SelectedBadge() {
  return (
    <View style={styles.checkBadge}>
      <Check size={14} color={COLORS.black} strokeWidth={3} />
    </View>
  );
}

const TILE_SIZE = 104;

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  scopeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  scopeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#333',
  },
  scopeChipActive: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.white,
  },
  scopeChipText: {
    color: '#BBB',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 13,
  },
  scopeChipTextActive: {
    color: COLORS.black,
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
  tilePreviewSelected: {
    borderColor: COLORS.white,
  },
  tilePreviewImage: {
    borderRadius: 16,
  },
  tilePatternImage: {
    // A 480 px tile repeated inside a 104 pt preview: scale it down so a
    // few doodles show instead of one corner of the tile.
    transform: [{ scale: 0.35 }],
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
    backgroundColor: COLORS.background.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#222',
  },
  inheritGlyph: {
    color: '#888',
    fontSize: 30,
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
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.black,
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
