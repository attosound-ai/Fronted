import { useCallback, useState } from 'react';
import { Linking, Pressable, StyleSheet, Switch, View } from 'react-native';
import { CloudCheck, CloudUpload, Circle, ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Text } from '@/components/ui/Text';
import { haptic } from '@/lib/haptics/hapticService';
import { studioPrefs, type TimelineMarker } from './studioPrefs';
import { STUDIO_COLORS } from './studioTheme';

interface Props {
  visible: boolean;
  onClose: () => void;
  isSaving: boolean;
  isDirty: boolean;
  onReplayTips?: () => void;
  /** Applied live so the editor reacts without reopening. */
  onPrefsChange?: () => void;
}

const SUPPORT_URL = 'https://attosound.com/support';

/**
 * The gear's sheet, laid out like the iOS Settings app: inset groups with
 * their own header, a row per setting, the value on the right. It carries
 * what SoundLab keeps in User Help and Preference: project state, ruler
 * marker, effect preview length, reduced animation, track index, keep
 * playing on zoom, the tips and support.
 */
export function StudioConfigSheet({
  visible,
  onClose,
  isSaving,
  isDirty,
  onReplayTips,
  onPrefsChange,
}: Props) {
  const { t } = useTranslation('projects');
  const [previewSeconds, setPreviewSeconds] = useState<3 | 5>(() =>
    studioPrefs.previewSeconds()
  );
  const [marker, setMarker] = useState<TimelineMarker>(() =>
    studioPrefs.timelineMarker()
  );
  const [reduceAnimation, setReduceAnimation] = useState(() =>
    studioPrefs.reduceAnimation()
  );
  const [showTrackIndex, setShowTrackIndex] = useState(() =>
    studioPrefs.showTrackIndex()
  );
  const [keepPlaying, setKeepPlaying] = useState(() => studioPrefs.keepPlayingOnZoom());

  const changed = useCallback(() => {
    void haptic('selection');
    onPrefsChange?.();
  }, [onPrefsChange]);

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('studio.configTitle')}>
      <View style={styles.content}>
        <Text variant="caption" style={styles.groupHeader}>
          {t('studio.groupProject')}
        </Text>
        <View style={styles.group}>
          <View style={styles.row}>
            <Text variant="body" style={styles.label}>
              {t('studio.saveState')}
            </Text>
            <View style={styles.value}>
              {isSaving ? (
                <CloudUpload
                  size={16}
                  color={STUDIO_COLORS.textMuted}
                  strokeWidth={2.25}
                />
              ) : isDirty ? (
                <Circle size={14} color={STUDIO_COLORS.textMuted} strokeWidth={2.25} />
              ) : (
                <CloudCheck size={16} color={STUDIO_COLORS.text} strokeWidth={2.25} />
              )}
              <Text variant="small" style={styles.valueText}>
                {isSaving
                  ? t('timeline.saveStatusSaving')
                  : isDirty
                    ? t('timeline.saveStatusUnsaved')
                    : t('timeline.saveStatusSaved')}
              </Text>
            </View>
          </View>
        </View>

        <Text variant="caption" style={styles.groupHeader}>
          {t('studio.groupPreferences')}
        </Text>
        <View style={styles.group}>
          <Segmented
            label={t('studio.timelineMarker')}
            options={[
              { key: 'timecode', label: t('studio.markerTimecode') },
              { key: 'second', label: t('studio.markerSecond') },
            ]}
            value={marker}
            onChange={(key) => {
              studioPrefs.setTimelineMarker(key as TimelineMarker);
              setMarker(key as TimelineMarker);
              changed();
            }}
          />
          <Divider />
          <Segmented
            label={t('studio.previewLength')}
            options={[
              { key: '3', label: t('studio.seconds', { n: 3 }) },
              { key: '5', label: t('studio.seconds', { n: 5 }) },
            ]}
            value={String(previewSeconds)}
            onChange={(key) => {
              const next = key === '5' ? 5 : 3;
              studioPrefs.setPreviewSeconds(next);
              setPreviewSeconds(next);
              changed();
            }}
          />
          <Divider />
          <Toggle
            label={t('studio.reduceAnimation')}
            value={reduceAnimation}
            onChange={(v) => {
              studioPrefs.setReduceAnimation(v);
              setReduceAnimation(v);
              changed();
            }}
          />
          <Divider />
          <Toggle
            label={t('studio.showTrackIndex')}
            value={showTrackIndex}
            onChange={(v) => {
              studioPrefs.setShowTrackIndex(v);
              setShowTrackIndex(v);
              changed();
            }}
          />
          <Divider />
          <Toggle
            label={t('studio.keepPlayingOnZoom')}
            value={keepPlaying}
            onChange={(v) => {
              studioPrefs.setKeepPlayingOnZoom(v);
              setKeepPlaying(v);
              changed();
            }}
          />
        </View>

        <Text variant="caption" style={styles.groupHeader}>
          {t('studio.groupHelp')}
        </Text>
        <View style={styles.group}>
          <Link
            label={t('studio.tipsReplay')}
            onPress={() => {
              void haptic('light');
              onClose();
              onReplayTips?.();
            }}
          />
          <Divider />
          <Link
            label={t('studio.support')}
            onPress={() => {
              void haptic('light');
              void Linking.openURL(SUPPORT_URL);
            }}
          />
        </View>
      </View>
    </BottomSheet>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <Text variant="body" style={styles.label}>
        {label}
      </Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: STUDIO_COLORS.primary }}
        thumbColor={value ? STUDIO_COLORS.onPrimary : undefined}
      />
    </View>
  );
}

function Segmented({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <View style={styles.row}>
      <Text variant="body" style={styles.label}>
        {label}
      </Text>
      <View style={styles.segmented}>
        {options.map((option) => {
          const active = option.key === value;
          return (
            <Pressable
              key={option.key}
              onPress={() => onChange(option.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.segment, active && styles.segmentActive]}
            >
              <Text
                variant="small"
                style={[styles.segmentText, active && styles.segmentTextActive]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Link({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Text variant="body" style={styles.label}>
        {label}
      </Text>
      <ChevronRight size={18} color={STUDIO_COLORS.textMuted} strokeWidth={2.25} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  groupHeader: {
    color: STUDIO_COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 14,
    marginBottom: 6,
    marginLeft: 4,
  },
  group: {
    borderRadius: 12,
    backgroundColor: STUDIO_COLORS.surfaceRaised,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 14,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  label: {
    color: STUDIO_COLORS.text,
    flexShrink: 1,
    marginRight: 12,
  },
  value: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  valueText: {
    color: STUDIO_COLORS.textMuted,
    marginLeft: 6,
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: 15,
    backgroundColor: STUDIO_COLORS.surface,
    padding: 2,
  },
  segment: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 13,
  },
  segmentActive: {
    backgroundColor: STUDIO_COLORS.primary,
  },
  segmentText: {
    color: STUDIO_COLORS.text,
  },
  segmentTextActive: {
    color: STUDIO_COLORS.onPrimary,
  },
  pressed: {
    opacity: 0.7,
  },
});
