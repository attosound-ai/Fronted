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
import { router } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
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

export function ProjectDetailScreen({ projectId, publishMode = false }: ProjectDetailScreenProps) {
  const { t } = useTranslation('projects');
  const queryClient = useQueryClient();
  const { data, isLoading } = useProjectDetail(projectId);
  const deleteProject = useDeleteProject();
  const [editorOpen, setEditorOpen] = useState(false);
  const editorWasOpened = useRef(false);
  const { isPreloading, progress, preloadEditor } = usePreloadEditor(data?.clips ?? []);
  const setPendingAudio = useCreatePostStore((s) => s.setPendingAudio);

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
        <Ionicons name="mic" size={20} color="#FFFFFF" />
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

    const handlePublish = async (result: ExportResult, durationMs: number) => {
      const localUri = `${FileSystem.cacheDirectory}export_${projectId}_${Date.now()}.wav`;
      await FileSystem.downloadAsync(result.downloadUrl, localUri);
      setPendingAudio({
        uri: localUri,
        fileName: `${project.name}.wav`,
        durationMs,
      });
      if (publishMode) {
        router.back();
      } else {
        router.push('/create-post');
      }
    };

    return (
      <TimelineEditor
        projectId={projectId}
        clips={clips}
        segments={segments}
        lanes={project.lanes}
        onClose={async () => {
          // Refetch BEFORE unmounting so detail view has fresh data
          await queryClient.refetchQueries({ queryKey: ['project', projectId] });
          setEditorOpen(false);
        }}
        onPublish={handlePublish}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
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
          <Ionicons name="close" size={24} color="#FFF" />
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
          <Ionicons name="trash-outline" size={22} color="#EF4444" />
        </TouchableOpacity>
      </View>

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

      <View style={styles.sectionHeader}>
        <Text variant="body" style={styles.sectionTitle}>
          {t('detail.sectionAudioSegments')}
        </Text>
      </View>

      <FlatList
        data={segments}
        keyExtractor={(item) => item.id}
        renderItem={renderSegment}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
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
