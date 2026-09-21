import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImagePlus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Text } from '@/components/ui/Text';
import { haptic } from '@/lib/haptics/hapticService';
import type { ExportFormat, ExportOptions, ExportQuality } from '@/types/project';
import { STUDIO_COLORS } from './studioTheme';

interface Props {
  visible: boolean;
  onClose: () => void;
  initial: ExportOptions;
  busy: boolean;
  /** Uploads the picked image and resolves the storage key. */
  onPickCover: (
    uri: string,
    mimeType: 'image/jpeg' | 'image/png'
  ) => Promise<string | null>;
  /** `coverUri` is the local image, for the post; `options.coverKey` is the
   *  uploaded one the exported file embeds. */
  onMixdown: (options: ExportOptions, coverUri: string | null) => void;
  /** Label of the main action: post to the feed, or just mix down. */
  actionLabel: string;
}

const FORMATS: ExportFormat[] = ['aac', 'alac', 'mp3', 'flac', 'wav'];
const QUALITIES: { key: ExportQuality; kbps: string }[] = [
  { key: 'low', kbps: '64' },
  { key: 'medium', kbps: '128' },
  { key: 'high', kbps: '256' },
];
const LOSSLESS: ExportFormat[] = ['wav', 'alac', 'flac'];

/**
 * SoundLab's Exporter, adapted: the format row, the three quality cards,
 * sample rate and channels, then the metadata the file carries (title,
 * author, ISRC, cover art, file name) and the mixdown button. In ATTO the
 * button also posts the mix when the editor was opened to publish.
 */
export function ExporterSheet({
  visible,
  onClose,
  initial,
  busy,
  onPickCover,
  onMixdown,
  actionLabel,
}: Props) {
  const { t } = useTranslation('projects');
  const [options, setOptions] = useState<ExportOptions>(initial);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);

  useEffect(() => {
    if (visible) setOptions(initial);
  }, [visible, initial]);

  const format = options.format ?? 'wav';
  const quality = options.quality ?? 'medium';
  const lossless = LOSSLESS.includes(format);

  const set = (patch: Partial<ExportOptions>) => {
    void haptic('selection');
    setOptions((o) => ({ ...o, ...patch }));
  };

  const pickCover = async () => {
    void haptic('light');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const mime = asset.uri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    setCoverUri(asset.uri);
    setUploadingCover(true);
    const key = await onPickCover(asset.uri, mime);
    setUploadingCover(false);
    if (key) setOptions((o) => ({ ...o, coverKey: key }));
    else setCoverUri(null);
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('studio.export.title')}>
      <View style={styles.content}>
        <View style={styles.formats}>
          {FORMATS.map((f) => (
            <Pressable
              key={f}
              onPress={() => set({ format: f })}
              accessibilityRole="button"
              accessibilityState={{ selected: format === f }}
              style={[styles.format, format === f && styles.formatActive]}
            >
              <Text
                variant="small"
                style={[styles.formatText, format === f && styles.formatTextActive]}
              >
                {f.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>

        {!lossless && (
          <View style={styles.cards}>
            {QUALITIES.map((q) => (
              <Pressable
                key={q.key}
                onPress={() => set({ quality: q.key })}
                accessibilityRole="button"
                accessibilityState={{ selected: quality === q.key }}
                style={[styles.card, quality === q.key && styles.cardActive]}
              >
                <Text variant="caption" style={styles.cardTitle}>
                  {t(`studio.export.${q.key}` as 'studio.export.low')}
                </Text>
                <Text variant="body" style={styles.cardValue}>
                  {q.kbps} kbps
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.row}>
          <Text variant="small" style={styles.label}>
            {t('studio.export.sampleRate')}
          </Text>
          <View style={styles.chips}>
            {([8000, 44100, 48000] as const).map((sr) => (
              <Pressable
                key={sr}
                onPress={() => set({ sampleRate: sr })}
                accessibilityRole="button"
                accessibilityState={{ selected: (options.sampleRate ?? 8000) === sr }}
                style={[
                  styles.chip,
                  (options.sampleRate ?? 8000) === sr && styles.chipActive,
                ]}
              >
                <Text
                  variant="caption"
                  style={[
                    styles.chipText,
                    (options.sampleRate ?? 8000) === sr && styles.chipTextActive,
                  ]}
                >
                  {sr >= 1000
                    ? `${(sr / 1000).toFixed(sr % 1000 === 0 ? 0 : 1)} kHz`
                    : sr}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.row}>
          <Text variant="small" style={styles.label}>
            {t('studio.export.channels')}
          </Text>
          <View style={styles.chips}>
            {([1, 2] as const).map((ch) => (
              <Pressable
                key={ch}
                onPress={() => set({ channels: ch })}
                accessibilityRole="button"
                accessibilityState={{ selected: (options.channels ?? 1) === ch }}
                style={[styles.chip, (options.channels ?? 1) === ch && styles.chipActive]}
              >
                <Text
                  variant="caption"
                  style={[
                    styles.chipText,
                    (options.channels ?? 1) === ch && styles.chipTextActive,
                  ]}
                >
                  {ch === 1 ? t('studio.export.mono') : t('studio.export.stereo')}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.divider} />

        <Field
          label={t('studio.export.titleField')}
          value={options.title ?? ''}
          onChange={(v) => setOptions((o) => ({ ...o, title: v }))}
          placeholder={t('studio.export.titlePlaceholder')}
        />
        <Field
          label={t('studio.export.author')}
          value={options.author ?? ''}
          onChange={(v) => setOptions((o) => ({ ...o, author: v }))}
          placeholder={t('studio.export.authorPlaceholder')}
        />
        <Field
          label={t('studio.export.isrc')}
          value={options.isrc ?? ''}
          onChange={(v) => setOptions((o) => ({ ...o, isrc: v }))}
          placeholder=""
          autoCapitalize="characters"
        />

        <View style={styles.row}>
          <Text variant="small" style={styles.label}>
            {t('studio.export.cover')}
          </Text>
          <Pressable
            onPress={pickCover}
            accessibilityRole="button"
            accessibilityLabel={t('studio.export.cover')}
            style={styles.cover}
          >
            {uploadingCover ? (
              <ActivityIndicator color={STUDIO_COLORS.text} />
            ) : coverUri ? (
              <Image source={{ uri: coverUri }} style={styles.coverImage} />
            ) : (
              <ImagePlus size={22} color={STUDIO_COLORS.textMuted} strokeWidth={2} />
            )}
          </Pressable>
        </View>

        <Field
          label={t('studio.export.fileName')}
          value={options.fileName ?? ''}
          onChange={(v) => setOptions((o) => ({ ...o, fileName: v }))}
          placeholder=""
        />

        <Pressable
          onPress={() => {
            void haptic('medium');
            onMixdown(options, coverUri);
          }}
          disabled={busy}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.action,
            busy && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator color={STUDIO_COLORS.onPrimary} />
          ) : (
            <Text variant="body" style={styles.actionText}>
              {actionLabel}
            </Text>
          )}
        </Pressable>
      </View>
    </BottomSheet>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  autoCapitalize = 'sentences',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoCapitalize?: 'none' | 'sentences' | 'characters';
}) {
  return (
    <View style={styles.row}>
      <Text variant="small" style={styles.label}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={STUDIO_COLORS.textDisabled}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingBottom: 36,
  },
  formats: {
    flexDirection: 'row',
    borderRadius: 18,
    backgroundColor: STUDIO_COLORS.surfaceRaised,
    padding: 3,
  },
  format: {
    flex: 1,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formatActive: {
    backgroundColor: STUDIO_COLORS.primary,
  },
  formatText: {
    color: STUDIO_COLORS.text,
    fontSize: 12,
  },
  formatTextActive: {
    color: STUDIO_COLORS.onPrimary,
    fontFamily: 'Archivo_600SemiBold',
  },
  cards: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  card: {
    flex: 1,
    height: 66,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: STUDIO_COLORS.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardActive: {
    borderColor: STUDIO_COLORS.primary,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  cardTitle: {
    color: STUDIO_COLORS.textMuted,
  },
  cardValue: {
    color: STUDIO_COLORS.text,
    fontFamily: 'Archivo_700Bold',
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 42,
    gap: 12,
  },
  label: {
    color: STUDIO_COLORS.textMuted,
    width: 96,
  },
  chips: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: STUDIO_COLORS.borderStrong,
  },
  chipActive: {
    backgroundColor: STUDIO_COLORS.primary,
    borderColor: STUDIO_COLORS.primary,
  },
  chipText: {
    color: STUDIO_COLORS.text,
  },
  chipTextActive: {
    color: STUDIO_COLORS.onPrimary,
  },
  divider: {
    height: 10,
  },
  input: {
    flex: 1,
    height: 38,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: STUDIO_COLORS.surfaceRaised,
    borderWidth: 1,
    borderColor: STUDIO_COLORS.borderStrong,
    color: STUDIO_COLORS.text,
    fontFamily: 'Archivo_400Regular',
  },
  cover: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: STUDIO_COLORS.surfaceRaised,
    borderWidth: 1,
    borderColor: STUDIO_COLORS.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  action: {
    height: 52,
    borderRadius: 26,
    marginTop: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: STUDIO_COLORS.primary,
  },
  actionText: {
    color: STUDIO_COLORS.onPrimary,
    fontFamily: 'Archivo_700Bold',
  },
  disabled: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.85,
  },
});
