import { useEffect, useRef, useState } from 'react';
import { ZOOM_MIN, ZOOM_MAX, clampZoom } from '../hooks/useTimeline';
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  Scissors,
  Trash2,
  Volume2,
  Undo2,
  Redo2,
  FolderOpen,
  Download,
  Upload,
  StopCircle,
  Copy,
  Minus,
  Plus,
  X,
  Sparkles,
  TextSelect,
  ClipboardCopy,
  ClipboardPaste,
  ScissorsLineDashed,
  VolumeX,
  BetweenHorizontalStart,
  Combine,
  type LucideIcon,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { Slider } from '@/components/ui/Slider';
import { haptic, type HapticType } from '@/lib/haptics/hapticService';

interface TimelineToolbarProps {
  onSplit: () => void;
  onDelete: () => void;
  onDuplicate?: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  hasSelection: boolean;
  canUndo: boolean;
  canRedo: boolean;
  isRecording?: boolean;
  onRecord?: () => void;
  onStopRecord?: () => void;
  recordingElapsed?: number;
  onImport?: () => void;
  isImporting?: boolean;
  onVolumePress?: () => void;
  onPublish?: () => void;
  isPublishing?: boolean;
  /** Caption under the edit actions, e.g. "Vocals · 00:12" (the selected
   *  clip's lane and length). Built by the caller, which owns that state. */
  selectedLabel?: string;
  /** The edit bar's ✕ — drops the selection and returns to browse mode. */
  onClearSelection?: () => void;
  /** Current zoom level. Together with `onZoomChange` this shows the thumb
   *  zoom control (−, slider, +); omit either to hide it. */
  zoom?: number;
  onZoomChange?: (level: number) => void;
  /** Whether the selected clip carries an effects render (shows the fx badge). */
  selectedHasEffects?: boolean;
  /** Opens the effects sheet for the selected clip. */
  onEffectsPress?: () => void;
  /** False on binaries without the renderer: the button dims, never hides. */
  effectsAvailable?: boolean;
  /** Heals the selected clip with its touching neighbor; `canJoin` dims it. */
  onJoin?: () => void;
  canJoin?: boolean;
  /** Range-selection mode toggle (browse bar). While on, a horizontal pan
   *  on a lane draws a region instead of scrolling. */
  selectMode?: boolean;
  onToggleSelectMode?: () => void;
  /** Region state: shown instead of the clip edit bar while a range exists. */
  hasRegion?: boolean;
  /** Caption for the region bar, e.g. "Range · 00:04 on Vocals". */
  regionLabel?: string;
  onClearRegion?: () => void;
  onCopy?: () => void;
  onCut?: () => void;
  onSilence?: () => void;
  /** Pastes the clipboard at the playhead; `canPaste` dims it when empty. */
  onPaste?: () => void;
  canPaste?: boolean;
  /** Inserts the region's length of empty time at its start, on all lanes. */
  onInsert?: () => void;
}

type BarMode = 'browse' | 'edit' | 'region';

// Same bounds SET_ZOOM enforces in useTimeline, so the control never asks
// for a level the reducer would clamp away. One detent = ×1.25 / ÷1.25.
const ZOOM_STEP = 1.25;
// The slider walks the range on a log scale: 0.1→4 spans 40×, and a linear
// thumb would spend most of its travel above 1× where nobody zooms.
const LN_ZOOM_MIN = Math.log(ZOOM_MIN);
const LN_ZOOM_RANGE = Math.log(ZOOM_MAX) - LN_ZOOM_MIN;
// Trailing delay before a slider move is committed to the reducer. Every
// commit re-lays out every clip, ruler mark and waveform bar (the pinch
// gesture in TimelineEditor previews on the UI thread for the same reason),
// so the thumb tracks the finger live but the timeline only re-flows once
// the finger pauses or lifts.
const ZOOM_COMMIT_DELAY_MS = 90;

// Fixed geometry: every state renders into the same STAGE_HEIGHT so the
// timeline above never jumps when a bar comes and goes.
const ROW_HEIGHT = 42;
const ROW_GAP = 8;
const STAGE_HEIGHT = ROW_HEIGHT * 2 + ROW_GAP;
// Undo/Redo sit in one fixed cluster at the top right of EVERY state, so
// the top row of each state reserves its width.
const HISTORY_BUTTON_WIDTH = 46;
const HISTORY_WIDTH = HISTORY_BUTTON_WIDTH * 2 + 4;
// An inactive layer sits a few points lower while it is faded out.
const LAYER_SHIFT = 6;
const TRANSITION_MS = 150;

function zoomToSlider(level: number): number {
  return (Math.log(clampZoom(level)) - LN_ZOOM_MIN) / LN_ZOOM_RANGE;
}

function sliderToZoom(value: number): number {
  return clampZoom(Math.exp(LN_ZOOM_MIN + value * LN_ZOOM_RANGE));
}

interface ToolButtonProps {
  Icon: LucideIcon;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Toggle-style highlight (blue icon + label) for mode buttons. */
  active?: boolean;
  color?: string;
  style?: ViewStyle;
}

function ToolButton({
  Icon,
  label,
  onPress,
  disabled,
  active,
  color = '#FFF',
  style,
}: ToolButtonProps) {
  const iconColor = disabled ? '#444' : active ? '#3B82F6' : color;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        style,
        active && styles.buttonActive,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Icon size={20} color={iconColor} strokeWidth={2.25} />
      <Text
        variant="caption"
        style={[
          styles.label,
          active && styles.labelActive,
          disabled && styles.labelDisabled,
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {label}
      </Text>
    </Pressable>
  );
}

interface SmallPillProps {
  Icon: LucideIcon;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

/** Compact secondary action that rides the caption row's right edge. */
function SmallPill({ Icon, label, onPress, disabled }: SmallPillProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.smallPill, disabled && styles.buttonDisabled]}
    >
      <Icon size={14} color="#FFF" strokeWidth={2.25} />
      <Text style={styles.smallPillLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Wraps a press handler so the tap is felt before the action lands. */
function withHaptic(kind: HapticType, onPress?: () => void): () => void {
  return () => {
    void haptic(kind);
    onPress?.();
  };
}

/**
 * Fades one state layer in (rising LAYER_SHIFT) or out. The three layers
 * stay mounted in the same absolute box; the caller flips pointerEvents.
 */
function useLayerStyle(active: boolean) {
  const progress = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, {
      duration: TRANSITION_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [active, progress]);
  return useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: LAYER_SHIFT * (1 - progress.value) }],
  }));
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Selection-aware action bar under the timeline. Three states, one box:
 *
 *   Browse (nothing selected)             [Import] [● Record] [Select]   [Undo][Redo]
 *                                         [−]━━━━━━━━[+]     [Export] [Publish]
 *   Edit (a clip is selected)             [Split][Duplicate][Volume][Effects][Delete]
 *                                         [✕] Selected: Vocals · 00:12 [fx]   [Join]
 *   Region (a range is drawn, wins)       [Copy][Cut][Silence][Paste]
 *                                         [✕] Range · 00:04 on Vocals      [Insert]
 *
 * Browse holds the project-level actions; Edit and Region hold only what
 * acts on the selection, in full color (nothing greyed out waiting for one).
 */
export function TimelineToolbar({
  onSplit,
  onDelete,
  onDuplicate,
  onUndo,
  onRedo,
  onExport,
  hasSelection,
  canUndo,
  canRedo,
  isRecording,
  onRecord,
  onStopRecord,
  recordingElapsed = 0,
  onImport,
  isImporting = false,
  onVolumePress,
  onPublish,
  isPublishing = false,
  selectedLabel,
  onClearSelection,
  zoom,
  onZoomChange,
  selectedHasEffects = false,
  onEffectsPress,
  effectsAvailable = true,
  onJoin,
  canJoin = false,
  selectMode = false,
  onToggleSelectMode,
  hasRegion = false,
  regionLabel,
  onClearRegion,
  onCopy,
  onCut,
  onSilence,
  onPaste,
  canPaste = false,
  onInsert,
}: TimelineToolbarProps) {
  const { t } = useTranslation('projects');

  // While a take is running the bar stays in browse mode whatever is
  // selected: Stop must never disappear under an edit bar mid-recording.
  // A drawn range outranks a selected clip, and in Select mode a selected
  // clip does not raise the edit bar either: the browse bar is where the
  // mode toggle (and Paste) live, so it stays in view until a range exists.
  const mode: BarMode = isRecording
    ? 'browse'
    : hasRegion
      ? 'region'
      : hasSelection && !selectMode
        ? 'edit'
        : 'browse';

  // ── Browse ⇄ Edit ⇄ Region crossfade ──
  // pointerEvents flips immediately so the incoming layer is tappable from
  // the first frame and the outgoing one can't catch a stray tap through
  // the fade.
  const browseStyle = useLayerStyle(mode === 'browse');
  const editStyle = useLayerStyle(mode === 'edit');
  const regionStyle = useLayerStyle(mode === 'region');

  // Record/Stop stays reachable in EVERY layer: a punch-in is "Split at the
  // playhead, then Record", and Split auto-selects the right half, so hiding
  // Record behind the browse layer forced a detour through ✕ first.
  const recordControl =
    onRecord || onStopRecord ? (
      isRecording ? (
        <Pressable
          style={styles.stopRecordButton}
          onPress={withHaptic('medium', onStopRecord)}
        >
          <StopCircle size={18} color="#FFF" strokeWidth={2.25} />
          <Text variant="caption" style={styles.stopRecordText}>
            {t('timeline.toolStopRecording', {
              elapsed: formatElapsed(recordingElapsed),
            })}
          </Text>
        </Pressable>
      ) : (
        <Pressable style={styles.recordButton} onPress={withHaptic('medium', onRecord)}>
          <View style={styles.recordDot} />
          <Text variant="caption" style={styles.recordText}>
            {t('timeline.toolRecord')}
          </Text>
        </Pressable>
      )
    ) : null;

  // The first clip selection is acknowledged here, as the edit bar appears;
  // switching between clips is ticked by the editor's select wiring, and a
  // range ticks when its drag starts.
  const wasEditRef = useRef(mode === 'edit');
  useEffect(() => {
    if (mode === 'edit' && !wasEditRef.current) void haptic('selection');
    wasEditRef.current = mode === 'edit';
  }, [mode]);

  // ── Thumb zoom ──
  const hasZoom = zoom !== undefined && !!onZoomChange;
  const zoomLevel = zoom ?? 1;
  const [sliderValue, setSliderValue] = useState(() => zoomToSlider(zoomLevel));
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Follow pinch / detent changes, but not while a slider commit is still
  // pending — the pending value is newer than the prop.
  useEffect(() => {
    if (commitTimerRef.current) return;
    setSliderValue(zoomToSlider(zoomLevel));
  }, [zoomLevel]);
  useEffect(() => () => clearTimeout(commitTimerRef.current), []);

  const handleSliderChange = (value: number) => {
    setSliderValue(value);
    clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(() => {
      commitTimerRef.current = undefined;
      onZoomChange?.(sliderToZoom(value));
    }, ZOOM_COMMIT_DELAY_MS);
  };

  const canZoomOut = zoomLevel > ZOOM_MIN + 1e-6;
  const canZoomIn = zoomLevel < ZOOM_MAX - 1e-6;
  const stepZoom = (direction: 1 | -1) => {
    const next = clampZoom(direction > 0 ? zoomLevel * ZOOM_STEP : zoomLevel / ZOOM_STEP);
    if (Math.abs(next - zoomLevel) < 1e-6) return;
    void haptic('selection');
    // A detent supersedes any slider move still waiting to commit.
    clearTimeout(commitTimerRef.current);
    commitTimerRef.current = undefined;
    onZoomChange?.(next);
  };

  return (
    <View style={styles.container}>
      <View style={styles.stage}>
        {/* Browse — project-level actions */}
        <Animated.View
          style={[styles.layer, browseStyle]}
          pointerEvents={mode === 'browse' ? 'auto' : 'none'}
        >
          <View style={[styles.row, styles.rowTop]}>
            {/* Import steps aside while Select mode is on so Paste fits;
                importing mid-selection is not a flow anyway. */}
            {onImport && !selectMode && (
              <ToolButton
                Icon={FolderOpen}
                label={
                  isImporting ? t('timeline.toolImporting') : t('timeline.toolImport')
                }
                onPress={onImport}
                disabled={isImporting}
              />
            )}
            {(onRecord || onStopRecord) &&
              (isRecording ? (
                <Pressable
                  style={styles.stopRecordButton}
                  onPress={withHaptic('medium', onStopRecord)}
                >
                  <StopCircle size={18} color="#FFF" strokeWidth={2.25} />
                  <Text variant="caption" style={styles.stopRecordText}>
                    {t('timeline.toolStopRecording', {
                      elapsed: formatElapsed(recordingElapsed),
                    })}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  style={styles.recordButton}
                  onPress={withHaptic('medium', onRecord)}
                >
                  <View style={styles.recordDot} />
                  <Text variant="caption" style={styles.recordText}>
                    {t('timeline.toolRecord')}
                  </Text>
                </Pressable>
              ))}
            {onToggleSelectMode && !isRecording && (
              <ToolButton
                Icon={TextSelect}
                label={t('timeline.toolSelect')}
                onPress={onToggleSelectMode}
                active={selectMode}
              />
            )}
            {selectMode && onPaste && (
              <ToolButton
                Icon={ClipboardPaste}
                label={t('timeline.toolPaste')}
                onPress={withHaptic('selection', onPaste)}
                disabled={!canPaste}
              />
            )}
          </View>
          <View style={styles.row}>
            {hasZoom && (
              <View style={styles.zoomCluster}>
                <Pressable
                  onPress={() => stepZoom(-1)}
                  disabled={!canZoomOut}
                  style={[styles.zoomButton, !canZoomOut && styles.buttonDisabled]}
                  accessibilityRole="button"
                  accessibilityLabel={t('timeline.toolZoomOut')}
                >
                  <Minus size={16} color="#FFF" strokeWidth={2.5} />
                </Pressable>
                <View
                  style={styles.zoomSlider}
                  accessibilityLabel={t('timeline.toolZoom')}
                >
                  <Slider
                    value={sliderValue}
                    onChange={handleSliderChange}
                    minimumTrackColor="#3B82F6"
                  />
                </View>
                <Pressable
                  onPress={() => stepZoom(1)}
                  disabled={!canZoomIn}
                  style={[styles.zoomButton, !canZoomIn && styles.buttonDisabled]}
                  accessibilityRole="button"
                  accessibilityLabel={t('timeline.toolZoomIn')}
                >
                  <Plus size={16} color="#FFF" strokeWidth={2.5} />
                </Pressable>
              </View>
            )}
            <View style={styles.shipCluster}>
              <ToolButton
                Icon={Download}
                label={t('timeline.toolExport')}
                onPress={onExport}
              />
              {onPublish && (
                <Pressable
                  onPress={onPublish}
                  disabled={isPublishing}
                  style={[styles.publishButton, isPublishing && styles.buttonDisabled]}
                >
                  {isPublishing ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <Upload size={16} color="#000" strokeWidth={2.25} />
                  )}
                  <Text style={styles.publishLabel}>
                    {isPublishing
                      ? t('timeline.toolPublishing')
                      : t('timeline.toolPublish')}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        </Animated.View>

        {/* Edit — what acts on the selected clip */}
        <Animated.View
          style={[styles.layer, editStyle]}
          pointerEvents={mode === 'edit' ? 'auto' : 'none'}
        >
          <View style={[styles.row, styles.rowTop, styles.rowEdit]}>
            <ToolButton
              Icon={Scissors}
              label={t('timeline.toolSplit')}
              onPress={withHaptic('medium', onSplit)}
              style={styles.editTool}
            />
            {onDuplicate && (
              <ToolButton
                Icon={Copy}
                label={t('timeline.toolDuplicate')}
                onPress={onDuplicate}
                style={styles.editTool}
              />
            )}
            {onVolumePress && (
              <ToolButton
                Icon={Volume2}
                label={t('timeline.toolVolume')}
                onPress={onVolumePress}
                style={styles.editTool}
              />
            )}
            {onEffectsPress && (
              <ToolButton
                Icon={Sparkles}
                label={t('timeline.toolEffects')}
                onPress={onEffectsPress}
                disabled={!effectsAvailable}
                style={styles.editTool}
              />
            )}
            <ToolButton
              Icon={Trash2}
              label={t('timeline.toolDelete')}
              onPress={withHaptic('medium', onDelete)}
              color="#EF4444"
              style={styles.editTool}
            />
          </View>
          <View style={styles.captionRow}>
            {recordControl}
            {onClearSelection && (
              <Pressable
                onPress={onClearSelection}
                style={styles.clearButton}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('timeline.toolClearSelection')}
              >
                <X size={14} color="#FFF" strokeWidth={2.5} />
              </Pressable>
            )}
            {selectedLabel && (
              <Text variant="caption" style={styles.captionText} numberOfLines={1}>
                {t('timeline.toolSelectedCaption', { label: selectedLabel })}
              </Text>
            )}
            {selectedHasEffects && (
              <View style={styles.fxBadge}>
                <View style={styles.fxDot} />
                <Text style={styles.fxBadgeText}>fx</Text>
              </View>
            )}
            {onJoin && (
              <SmallPill
                Icon={Combine}
                label={t('timeline.toolJoin')}
                onPress={withHaptic('medium', onJoin)}
                disabled={!canJoin}
              />
            )}
          </View>
        </Animated.View>

        {/* Region — what acts on the drawn range */}
        <Animated.View
          style={[styles.layer, regionStyle]}
          pointerEvents={mode === 'region' ? 'auto' : 'none'}
        >
          <View style={[styles.row, styles.rowTop, styles.rowRegion]}>
            <ToolButton
              Icon={ClipboardCopy}
              label={t('timeline.toolCopy')}
              onPress={withHaptic('selection', onCopy)}
              style={styles.editTool}
            />
            <ToolButton
              Icon={ScissorsLineDashed}
              label={t('timeline.toolCut')}
              onPress={withHaptic('medium', onCut)}
              style={styles.editTool}
            />
            <ToolButton
              Icon={VolumeX}
              label={t('timeline.toolSilence')}
              onPress={withHaptic('medium', onSilence)}
              style={styles.editTool}
            />
            <ToolButton
              Icon={ClipboardPaste}
              label={t('timeline.toolPaste')}
              onPress={withHaptic('selection', onPaste)}
              disabled={!canPaste}
              style={styles.editTool}
            />
          </View>
          <View style={styles.captionRow}>
            {recordControl}
            {onClearRegion && (
              <Pressable
                onPress={onClearRegion}
                style={styles.clearButton}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('timeline.toolClearSelection')}
              >
                <X size={14} color="#FFF" strokeWidth={2.5} />
              </Pressable>
            )}
            {regionLabel && (
              <Text variant="caption" style={styles.captionText} numberOfLines={1}>
                {regionLabel}
              </Text>
            )}
            {onInsert && (
              <SmallPill
                Icon={BetweenHorizontalStart}
                label={t('timeline.toolInsert')}
                onPress={withHaptic('medium', onInsert)}
              />
            )}
          </View>
        </Animated.View>

        {/* Undo / Redo — one cluster, visible in every state */}
        <View style={styles.historyCluster}>
          <ToolButton
            Icon={Undo2}
            label={t('timeline.toolUndo')}
            onPress={onUndo}
            disabled={!canUndo}
            style={styles.historyButton}
          />
          <ToolButton
            Icon={Redo2}
            label={t('timeline.toolRedo')}
            onPress={onRedo}
            disabled={!canRedo}
            style={styles.historyButton}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111',
    borderTopWidth: 1,
    borderTopColor: '#222',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  stage: {
    height: STAGE_HEIGHT,
  },
  layer: {
    ...StyleSheet.absoluteFillObject,
    gap: ROW_GAP,
  },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // Top rows leave the right edge free for the history cluster.
  rowTop: {
    paddingRight: HISTORY_WIDTH + 8,
  },
  // Five equal tools next to the history cluster: a tight gap keeps their
  // labels at (nearly) full size on 375pt phones.
  rowEdit: {
    gap: 2,
  },
  rowRegion: {
    gap: 4,
  },
  historyCluster: {
    position: 'absolute',
    top: 0,
    right: 0,
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  historyButton: {
    width: HISTORY_BUTTON_WIDTH,
    paddingHorizontal: 2,
  },
  // Edit tools share the row equally; labels shrink rather than wrap.
  editTool: {
    flex: 1,
    minWidth: 0,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 4,
    gap: 2,
    borderRadius: 8,
  },
  buttonActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.14)',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  label: {
    color: '#999',
    fontSize: 10,
    lineHeight: 12,
  },
  labelActive: {
    color: '#3B82F6',
  },
  labelDisabled: {
    color: '#444',
  },
  recordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
  },
  recordDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
  },
  recordText: {
    color: '#FFF',
    fontSize: 12,
    fontFamily: 'Archivo_500Medium',
  },
  stopRecordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
  },
  stopRecordText: {
    color: '#FFF',
    fontSize: 12,
    fontFamily: 'Archivo_600SemiBold',
  },
  zoomCluster: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  zoomButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
  },
  zoomSlider: {
    flex: 1,
    minWidth: 64,
  },
  shipCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 'auto',
  },
  publishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 6,
  },
  publishLabel: {
    color: '#000',
    fontSize: 12,
    fontFamily: 'Archivo_600SemiBold',
  },
  captionRow: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  clearButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
  },
  captionText: {
    color: '#888',
    fontSize: 12,
    flexShrink: 1,
  },
  fxBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  fxDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#3B82F6',
  },
  fxBadgeText: {
    color: '#3B82F6',
    fontSize: 10,
    lineHeight: 12,
    fontFamily: 'Archivo_700Bold',
  },
  smallPill: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
  },
  smallPillLabel: {
    color: '#FFF',
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Archivo_500Medium',
  },
});
