import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
  Easing,
} from 'react-native-reanimated';
import {
  Camera,
  Contact,
  FileText,
  Images,
  MapPin,
  Mic,
  Music4,
  Video,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { GlassSurface } from '@/components/navigation/GlassSurface';
import { COLORS } from '@/constants/theme';

export type AttachAction =
  | 'camera'
  | 'photos'
  | 'video_note'
  | 'voice'
  | 'file'
  | 'contact'
  | 'location'
  | 'project_audio';

interface AttachMenuProps {
  visible: boolean;
  /** Distance from the bottom of the screen to the top of the composer. */
  bottom: number;
  onClose: () => void;
  onPick: (action: AttachAction) => void;
}

const EASE = Easing.out(Easing.cubic);

/**
 * iMessage's "+" menu on iOS 26: a glass panel that grows out of the plus
 * button with one row per app (Camera, Photos, ...). Tapping outside closes
 * it. Every row is native looking and reports which one people reach for.
 */
export function AttachMenu({ visible, bottom, onClose, onPick }: AttachMenuProps) {
  const { t } = useTranslation('messages');
  if (!visible) return null;
  const rows: {
    action: AttachAction;
    label: string;
    icon: React.ReactNode;
    soon?: boolean;
  }[] = [
    {
      action: 'camera',
      label: t('attachMenu.camera'),
      icon: <Camera size={22} color={COLORS.white} strokeWidth={2} />,
    },
    {
      action: 'photos',
      label: t('attachMenu.photos'),
      icon: <Images size={22} color={COLORS.white} strokeWidth={2} />,
    },
    {
      action: 'video_note',
      label: t('attachMenu.videoNote'),
      icon: <Video size={22} color={COLORS.white} strokeWidth={2} />,
    },
    {
      action: 'voice',
      label: t('attachMenu.voice'),
      icon: <Mic size={22} color={COLORS.white} strokeWidth={2} />,
    },
    {
      action: 'file',
      label: t('attachMenu.file'),
      icon: <FileText size={22} color={COLORS.white} strokeWidth={2} />,
    },
    {
      action: 'contact',
      label: t('attachMenu.contact'),
      icon: <Contact size={22} color={COLORS.white} strokeWidth={2} />,
    },
    {
      action: 'project_audio',
      label: t('attachMenu.projectAudio'),
      icon: <Music4 size={22} color={COLORS.white} strokeWidth={2} />,
      soon: true,
    },
    {
      action: 'location',
      label: t('attachMenu.location'),
      icon: <MapPin size={22} color={COLORS.white} strokeWidth={2} />,
      soon: true,
    },
  ];
  return (
    <>
      <Animated.View
        entering={FadeIn.duration(150)}
        exiting={FadeOut.duration(120)}
        style={StyleSheet.absoluteFill}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel={t('attachMenu.close')}
        />
      </Animated.View>
      <Animated.View
        entering={FadeInDown.duration(220)
          .easing(EASE)
          .withInitialValues({
            transform: [{ translateY: 24 }, { scale: 0.9 }],
            opacity: 0,
          })}
        exiting={FadeOutDown.duration(140)}
        style={[styles.panelWrap, { bottom }]}
      >
        <GlassSurface radius={24} style={styles.panel}>
          <View style={styles.list}>
            {rows.map((row) => (
              <Pressable
                key={row.action}
                onPress={() => onPick(row.action)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                accessibilityRole="button"
                accessibilityLabel={row.label}
              >
                <View style={styles.iconCircle}>{row.icon}</View>
                <Text style={styles.label} numberOfLines={1}>
                  {row.label}
                </Text>
                {row.soon ? (
                  <Text style={styles.soon}>{t('attachMenu.soon')}</Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        </GlassSurface>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  panelWrap: { position: 'absolute', left: 10, width: 232 },
  panel: { borderRadius: 24, overflow: 'hidden' },
  list: { paddingVertical: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  rowPressed: { backgroundColor: 'rgba(255,255,255,0.08)' },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { flex: 1, color: COLORS.white, fontSize: 16, fontFamily: 'Archivo_500Medium' },
  soon: { color: '#888', fontSize: 11, fontFamily: 'Archivo_500Medium' },
});
