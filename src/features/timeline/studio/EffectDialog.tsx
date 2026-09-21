import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import NativeSlider from '@react-native-community/slider';
import { useTranslation } from 'react-i18next';
import { BlurView } from 'expo-blur';

import { Text } from '@/components/ui/Text';
import { haptic } from '@/lib/haptics/hapticService';
import { defaultValuesFor, type EffectDef, type EffectValues } from './effectsCatalog';
import { STUDIO_COLORS } from './studioTheme';

interface Props {
  effect: EffectDef | null;
  onCancel: () => void;
  onPreview: (values: EffectValues) => void;
  onApply: (values: EffectValues) => void;
  busy: boolean;
  previewing: boolean;
  /** 0..1 while applying, null otherwise. */
  progress: number | null;
  /** Why the last apply failed. A toast would hide behind this dialog. */
  errorText?: string | null;
}

function formatValue(v: number, step: number, unit: string): string {
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  return `${v.toFixed(decimals)}${unit ? ` ${unit}` : ''}`;
}

/**
 * SoundLab's effect dialog: presets down the left, one native slider per
 * parameter with its value on the right, and Cancel, Preview, Apply at the
 * bottom. Moving any slider switches the preset to Custom.
 */
export function EffectDialog({
  effect,
  onCancel,
  onPreview,
  onApply,
  busy,
  previewing,
  progress,
  errorText,
}: Props) {
  const { t } = useTranslation('projects');
  const [values, setValues] = useState<EffectValues>({});
  const [preset, setPreset] = useState('Custom');

  useEffect(() => {
    if (!effect) return;
    const first = effect.presets.find((p) => p.name !== 'Custom');
    setValues({ ...defaultValuesFor(effect), ...(first?.values ?? {}) });
    setPreset(first?.name ?? 'Custom');
  }, [effect]);

  const hasPresets = (effect?.presets.length ?? 0) > 0;
  const columns = useMemo(() => effect?.params ?? [], [effect]);

  if (!effect) return null;

  const set = (key: string, value: number | string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setPreset('Custom');
  };
  const pickPreset = (name: string) => {
    void haptic('selection');
    const p = effect.presets.find((x) => x.name === name);
    if (!p) return;
    setPreset(name);
    if (name !== 'Custom') setValues((v) => ({ ...v, ...p.values }));
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <BlurView intensity={30} tint="dark" style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={busy ? undefined : onCancel}
        />
        <View style={styles.card}>
          <View style={styles.header}>
            <Text variant="body" style={styles.title}>
              {effect.name}
            </Text>
          </View>
          <View style={styles.body}>
            {hasPresets && (
              <ScrollView style={styles.presets} showsVerticalScrollIndicator={false}>
                {effect.presets.map((p) => (
                  <Pressable
                    key={p.name}
                    onPress={() => pickPreset(p.name)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: preset === p.name }}
                    style={[styles.preset, preset === p.name && styles.presetActive]}
                  >
                    <Text
                      variant="small"
                      numberOfLines={1}
                      style={[
                        styles.presetText,
                        preset === p.name && styles.presetTextActive,
                      ]}
                    >
                      {p.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <ScrollView style={styles.params} showsVerticalScrollIndicator={false}>
              {columns.length === 0 && (
                <Text variant="small" style={styles.noParams}>
                  {t('studio.effects.noParams')}
                </Text>
              )}
              {columns.map((p) =>
                p.kind === 'slider' ? (
                  <View key={p.key} style={styles.paramRow}>
                    <Text variant="caption" numberOfLines={1} style={styles.paramLabel}>
                      {p.label}
                    </Text>
                    <NativeSlider
                      style={styles.slider}
                      minimumValue={p.min ?? 0}
                      maximumValue={p.max ?? 1}
                      step={p.step ?? 0}
                      value={
                        typeof values[p.key] === 'number'
                          ? (values[p.key] as number)
                          : (p.defaultValue as number)
                      }
                      onValueChange={(v) => set(p.key, v)}
                      minimumTrackTintColor={STUDIO_COLORS.text}
                      maximumTrackTintColor={STUDIO_COLORS.borderStrong}
                      thumbTintColor={STUDIO_COLORS.text}
                    />
                    <Text variant="caption" style={styles.paramValue}>
                      {formatValue(
                        typeof values[p.key] === 'number'
                          ? (values[p.key] as number)
                          : Number(p.defaultValue),
                        p.step ?? 1,
                        p.unit ?? ''
                      )}
                    </Text>
                  </View>
                ) : (
                  <View key={p.key} style={styles.choiceRow}>
                    <Text variant="caption" style={styles.paramLabel}>
                      {p.label}
                    </Text>
                    <View style={styles.choices}>
                      {(p.options ?? []).map((o) => {
                        const active = values[p.key] === o.value;
                        return (
                          <Pressable
                            key={o.value}
                            onPress={() => set(p.key, o.value)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            style={[styles.choice, active && styles.choiceActive]}
                          >
                            <Text
                              variant="caption"
                              style={[
                                styles.choiceText,
                                active && styles.choiceTextActive,
                              ]}
                            >
                              {o.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                )
              )}
            </ScrollView>
          </View>
          {errorText ? (
            <Text variant="caption" style={styles.error}>
              {errorText}
            </Text>
          ) : null}
          {progress !== null && (
            <View style={styles.progressTrack}>
              <View
                style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]}
              />
            </View>
          )}
          <View style={styles.footer}>
            <Pressable
              onPress={onCancel}
              disabled={busy}
              accessibilityRole="button"
              style={[styles.button, styles.buttonGhost, busy && styles.disabled]}
            >
              <Text variant="small" style={styles.buttonGhostText}>
                {t('studio.effects.cancel')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onPreview(values)}
              disabled={busy}
              accessibilityRole="button"
              style={[styles.button, styles.buttonGhost, busy && styles.disabled]}
            >
              {previewing ? (
                <ActivityIndicator color={STUDIO_COLORS.text} />
              ) : (
                <Text variant="small" style={styles.buttonGhostText}>
                  {t('studio.effects.preview')}
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => onApply(values)}
              disabled={busy}
              accessibilityRole="button"
              style={[styles.button, styles.buttonPrimary, busy && styles.disabled]}
            >
              {busy && !previewing ? (
                <ActivityIndicator color={STUDIO_COLORS.onPrimary} />
              ) : (
                <Text variant="small" style={styles.buttonPrimaryText}>
                  {t('studio.effects.apply')}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '78%',
    borderRadius: 18,
    backgroundColor: STUDIO_COLORS.surface,
    borderWidth: 1,
    borderColor: STUDIO_COLORS.borderStrong,
    overflow: 'hidden',
  },
  header: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: STUDIO_COLORS.surfaceRaised,
  },
  title: {
    color: STUDIO_COLORS.text,
    fontFamily: 'Archivo_700Bold',
  },
  body: {
    flexDirection: 'row',
    minHeight: 200,
    maxHeight: 420,
  },
  presets: {
    width: 122,
    flexGrow: 0,
    flexShrink: 0,
    paddingVertical: 10,
    paddingLeft: 10,
  },
  preset: {
    height: 30,
    borderRadius: 6,
    marginBottom: 6,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: STUDIO_COLORS.surfaceRaised,
    borderWidth: 1,
    borderColor: STUDIO_COLORS.borderStrong,
  },
  presetActive: {
    backgroundColor: STUDIO_COLORS.primary,
    borderColor: STUDIO_COLORS.primary,
  },
  presetText: {
    color: STUDIO_COLORS.text,
    fontSize: 12,
  },
  presetTextActive: {
    color: STUDIO_COLORS.onPrimary,
  },
  params: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  noParams: {
    color: STUDIO_COLORS.textMuted,
    textAlign: 'center',
    marginTop: 40,
  },
  paramRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
  },
  paramLabel: {
    width: 62,
    color: STUDIO_COLORS.textMuted,
    textAlign: 'right',
    marginRight: 6,
  },
  slider: {
    flex: 1,
    height: 30,
  },
  paramValue: {
    width: 52,
    color: STUDIO_COLORS.text,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 6,
  },
  choices: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  choice: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: STUDIO_COLORS.borderStrong,
  },
  choiceActive: {
    backgroundColor: STUDIO_COLORS.primary,
    borderColor: STUDIO_COLORS.primary,
  },
  choiceText: {
    color: STUDIO_COLORS.text,
  },
  choiceTextActive: {
    color: STUDIO_COLORS.onPrimary,
  },
  error: {
    color: '#FF6B61',
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  progressTrack: {
    height: 3,
    backgroundColor: STUDIO_COLORS.borderStrong,
  },
  progressFill: {
    height: 3,
    backgroundColor: STUDIO_COLORS.primary,
  },
  footer: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
  },
  button: {
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  buttonGhost: {
    flex: 1,
    borderWidth: 1,
    borderColor: STUDIO_COLORS.borderStrong,
  },
  buttonGhostText: {
    color: STUDIO_COLORS.text,
  },
  buttonPrimary: {
    flex: 1.4,
    backgroundColor: STUDIO_COLORS.primary,
  },
  buttonPrimaryText: {
    color: STUDIO_COLORS.onPrimary,
    fontFamily: 'Archivo_700Bold',
  },
  disabled: {
    opacity: 0.5,
  },
});
