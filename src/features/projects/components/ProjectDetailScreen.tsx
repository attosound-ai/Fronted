import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CollapsibleHeader } from '@/components/ui/CollapsibleHeader';
import { useCollapsibleHeader } from '@/hooks/useCollapsibleHeader';
import { router } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { useQueryClient } from '@tanstack/react-query';
import { useCallStore } from '@/stores/callStore';
import { X, Trash2, Mic } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Toast, showToast } from '@/components/ui/Toast';
import { useProjectDetail } from '../hooks/useProjectDetail';
import { useDeleteProject } from '../hooks/useProjects';
import { usePreloadEditor } from '@/features/timeline/hooks/usePreloadEditor';
import { EditorLoadingModal } from '@/features/timeline/components/EditorLoadingModal';
import { useCreatePostStore } from '@/stores/createPostStore';
import type { AudioSegment } from '@/types/call';
import type { ExportResult } from '@/types/project';
import { COLORS } from '@/constants/theme';

interface ProjectDetailScreenProps {
  projectId: string;
  publishMode?: boolean;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function ProjectDetailScreen({
  projectId,
  publishMode = false,
}: ProjectDetailScreenProps) {
  const { t } = useTranslation('projects');
  const queryClient = useQueryClient();
  const { data, isLoading } = useProjectDetail(projectId);
  const header = useCollapsibleHeader();
  const deleteProject = useDeleteProject();
  const [editorOpen, setEditorOpen] = useState(false);
  const editorWasOpened = useRef(false);
  const { isPreloading, progress, preloadEditor } = usePreloadEditor(data?.clips ?? []);
  const setPendingAudio = useCreatePostStore((s) => s.setPendingAudio);
  // Drives recordingMode below: this screen is reachable DURING a live call (the
  // in-call editor landing opens it), and recording works completely differently
  // there. See the recordingMode prop for the failure this prevents.
  const activeCall = useCallStore((s) => s.activeCall);

  // In publish mode, auto-open the editor ONCE when data is loaded
  useEffect(() => {
    if (!publishMode || !data || editorWasOpened.current || isPreloading) return;
    editorWasOpened.current = true;
    preloadEditor().then(() => setEditorOpen(true));
  }, [publishMode, data, isPreloading, preloadEditor]);

  const handleDelete = useCallback(() => {
    Alert.alert(t('detail.deleteAlertTitle'), t('detail.deleteAlertMessage'), [
      { text: t('detail.deleteAlertCancel'), style: 'cancel' },
      {
        text: t('detail.deleteAlertConfirm'),
        style: 'destructive',
        onPress: () => {
          deleteProject.mutate(projectId, {
            onSuccess: () => router.back(),
            onError: () => showToast(t('detail.errorDeleteFailed')),
          });
        },
      },
    ]);
  }, [projectId, deleteProject]);

  const renderSegment = useCallback(
    ({ item }: { item: AudioSegment & { downloadUrl: string } }) => (
      <View style={styles.segmentCard}>
        <Mic size={20} color="#FFFFFF" strokeWidth={2.25} />
        <View style={styles.segmentInfo}>
          <Text variant="body" style={styles.segmentLabel}>
            {item.label ||
              t('detail.segmentDefaultLabel', { index: item.segmentIndex + 1 })}
          </Text>
          <Text variant="caption" style={styles.segmentMeta}>
            {formatDuration(item.durationMs)}
          </Text>
        </View>
      </View>
    ),
    []
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text variant="body" style={{ color: '#666' }}>
            {t('detail.projectNotFound')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const { project, segments, clips } = data;

  if (editorOpen) {
    const TimelineEditor =
      require('@/features/timeline/components/TimelineEditor').TimelineEditor;

    const handlePublish = async (
      result: ExportResult,
      durationMs: number,
      coverUri?: string
    ) => {
      const localUri = `${FileSystem.cacheDirectory}export_${projectId}_${Date.now()}.wav`;
      await FileSystem.downloadAsync(result.downloadUrl, localUri);
      setPendingAudio({
        uri: localUri,
        fileName: `${project.name}.wav`,
        durationMs,
        coverUri,
      });
      if (publishMode) {
        router.back();
      } else {
        router.push('/create-post');
      }
    };

    return (
      <TimelineEditor
        // RECORD DURING A CALL (build 156). Without this the editor fell back to
        // the default 'mic' mode, and its recorder (a) cannot get the microphone
        // while CallKit/Twilio own the session, so the take came out EMPTY, and
        // (b) writes setAudioModeAsync({playsInSilentMode:true}) — the Playback
        // category, which STRIPS the mic from the live call. The client hit
        // exactly this on Aug 20: he was auto-landed here mid-call by
        // incall_editor_autoload, tapped Record twice and "there was nothing
        // there" (call_recording_placed fired, call_capture_started never did).
        // With an active call we use the same server-side Twilio capture the
        // dedicated call screen uses; with no call, plain mic recording.
        recordingMode={activeCall ? 'twilioCall' : 'mic'}
        // Force a fresh mount whenever the server-side data changes
        // (e.g. after a refetch). This guarantees `useTimeline`'s
        // `useReducer` lazy init reads the latest lanes/clips instead
        // of holding onto stale state from the previous mount, which
        // would persist indefinitely because React's `useReducer`
        // doesn't react to changes in its initial-state argument.
        key={`${projectId}-${project.updatedAt}`}
        projectId={projectId}
        clips={clips}
        segments={segments}
        lanes={project.lanes}
        settings={project.settings}
        onClose={async () => {
          // Refetch BEFORE unmounting so detail view has fresh data
          await queryClient.refetchQueries({ queryKey: ['project', projectId] });
          setEditorOpen(false);
        }}
        onPublish={handlePublish}
      />
    );
  }

  // One row per lane the project has: its name, its color and how many clips
  // sit on it. Lanes with no metadata still show, named like the editor names
  // them, so a recorded take is visible here right away.
  const trackRows = (() => {
    const lanes = project.lanes ?? {};
    const laneIndexes = new Set<number>();
    for (const key of Object.keys(lanes)) laneIndexes.add(Number(key));
    for (const clip of clips) laneIndexes.add(clip.laneIndex ?? 0);
    return Array.from(laneIndexes)
      .filter((i) => Number.isFinite(i))
      .sort((a, b) => a - b)
      .map((index) => {
        const meta = lanes[String(index)];
        return {
          index,
          name: meta?.name || t('detail.trackDefaultName', { n: index + 1 }),
          color: meta?.color || '#3B82F6',
          clipCount: clips.filter((c) => (c.laneIndex ?? 0) === index).length,
        };
      });
  })();

  return (
    <View style={styles.container}>
      {/* Spacer pushes statsRow and all content below the floating header overlay */}
      <View style={{ height: header.height }} />

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text variant="caption" style={styles.statLabel}>
            {t('detail.statTracks')}
          </Text>
          <Text variant="body" style={styles.statValue}>
            {segments.length}
          </Text>
        </View>
        <View style={styles.stat}>
          <Text variant="caption" style={styles.statLabel}>
            {t('detail.statClips')}
          </Text>
          <Text variant="body" style={styles.statValue}>
            {clips.length}
          </Text>
        </View>
        <View style={styles.stat}>
          <Text variant="caption" style={styles.statLabel}>
            {t('detail.statStatus')}
          </Text>
          <Text variant="body" style={styles.statValue}>
            {project.status}
          </Text>
        </View>
      </View>

      {/* The tracks, with the names and colors given in the editor, so the
          project reads the same here as it does inside it. */}
      {trackRows.length > 0 && (
        <View style={styles.tracksBlock}>
          <View style={styles.sectionHeader}>
            <Text variant="body" style={styles.sectionTitle}>
              {t('detail.sectionTracks')}
            </Text>
          </View>
          <View style={styles.trackRows}>
            {trackRows.map((track) => (
              <View key={track.index} style={styles.trackRow}>
                <View style={[styles.trackDot, { backgroundColor: track.color }]} />
                <Text variant="body" numberOfLines={1} style={styles.trackName}>
                  {track.name}
                </Text>
                <Text variant="caption" style={styles.trackMeta}>
                  {t('detail.trackClips', { count: track.clipCount })}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={styles.sectionHeader}>
        <Text variant="body" style={styles.sectionTitle}>
          {t('detail.sectionAudioSegments')}
        </Text>
      </View>

      <FlatList
        data={segments}
        keyExtractor={(item) => item.id}
        renderItem={renderSegment}
        onScroll={header.onScroll}
        scrollEventThrottle={header.scrollEventThrottle}
        contentContainerStyle={styles.segmentList}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={
          <View style={styles.emptySegments}>
            <Text variant="body" style={{ color: '#666' }}>
              {t('detail.emptySegments')}
            </Text>
          </View>
        }
      />

      <View style={styles.footer}>
        <Button
          title={t('detail.openEditorButton')}
          onPress={async () => {
            await preloadEditor();
            setEditorOpen(true);
          }}
        />
      </View>
      <EditorLoadingModal visible={isPreloading} progress={progress} />
      <Toast />
      <CollapsibleHeader animatedStyle={header.animatedStyle}>
        <TouchableOpacity
          onPress={() => {
            console.log('[ProjectDetail] X pressed, canGoBack:', router.canGoBack());
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/(tabs)');
            }
          }}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.5}
        >
          <X size={24} color="#FFF" strokeWidth={2.25} />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Text variant="h3" style={styles.title} numberOfLines={1}>
            {project.name}
          </Text>
          {project.description ? (
            <Text variant="caption" style={styles.description} numberOfLines={1}>
              {project.description}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity onPress={handleDelete} style={styles.deleteButton}>
          <Trash2 size={22} color="#EF4444" strokeWidth={2.25} />
        </TouchableOpacity>
      </CollapsibleHeader>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background.primary,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: '#FFF',
  },
  description: {
    color: '#666',
  },
  deleteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 24,
  },
  stat: {
    gap: 2,
  },
  tracksBlock: {
    marginBottom: 4,
  },
  trackRows: {
    paddingHorizontal: 16,
    gap: 8,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: '#111111',
  },
  trackDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  trackName: {
    flex: 1,
    color: '#FFFFFF',
  },
  trackMeta: {
    color: '#888888',
  },
  statLabel: {
    color: '#666',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  statValue: {
    color: '#FFF',
    fontFamily: 'Archivo_600SemiBold',
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionTitle: {
    color: '#888',
    fontFamily: 'Archivo_500Medium',
    fontSize: 13,
    textTransform: 'uppercase',
  },
  segmentList: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  segmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 14,
    gap: 12,
  },
  segmentInfo: {
    flex: 1,
    gap: 2,
  },
  segmentLabel: {
    color: '#FFF',
    fontSize: 14,
  },
  segmentMeta: {
    color: '#666',
    fontSize: 12,
  },
  emptySegments: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
});
