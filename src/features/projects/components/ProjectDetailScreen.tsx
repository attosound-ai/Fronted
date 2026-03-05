import { useCallback, useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Toast, showToast } from '@/components/ui/Toast';
import { useProjectDetail } from '../hooks/useProjectDetail';
import { useDeleteProject } from '../hooks/useProjects';
import { usePreloadEditor } from '@/features/timeline/hooks/usePreloadEditor';
import { EditorLoadingModal } from '@/features/timeline/components/EditorLoadingModal';
import type { AudioSegment } from '@/types/call';

interface ProjectDetailScreenProps {
  projectId: string;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function ProjectDetailScreen({ projectId }: ProjectDetailScreenProps) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useProjectDetail(projectId);
  const deleteProject = useDeleteProject();
  const [editorOpen, setEditorOpen] = useState(false);
  const { isPreloading, progress, preloadEditor } = usePreloadEditor(
    data?.clips ?? [],
  );

  const handleDelete = useCallback(() => {
    Alert.alert('Delete Project', 'Are you sure? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteProject.mutate(projectId, {
            onSuccess: () => router.back(),
            onError: () => showToast('Failed to delete project'),
          });
        },
      },
    ]);
  }, [projectId, deleteProject]);

  const renderSegment = useCallback(
    ({ item }: { item: AudioSegment & { downloadUrl: string } }) => (
      <View style={styles.segmentCard}>
        <Ionicons name="mic" size={20} color="#3B82F6" />
        <View style={styles.segmentInfo}>
          <Text variant="body" style={styles.segmentLabel}>
            {item.label || `Recording ${item.segmentIndex + 1}`}
          </Text>
          <Text variant="caption" style={styles.segmentMeta}>
            {formatDuration(item.durationMs)}
          </Text>
        </View>
      </View>
    ),
    [],
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
            Project not found
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const { project, segments, clips } = data;

  if (editorOpen) {
    const TimelineEditor =
      require('@/features/timeline/components/TimelineEditor').TimelineEditor;
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
      />
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </Pressable>
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
        <Pressable onPress={handleDelete} style={styles.deleteButton}>
          <Ionicons name="trash-outline" size={22} color="#EF4444" />
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text variant="caption" style={styles.statLabel}>
            Tracks
          </Text>
          <Text variant="body" style={styles.statValue}>
            {segments.length}
          </Text>
        </View>
        <View style={styles.stat}>
          <Text variant="caption" style={styles.statLabel}>
            Clips
          </Text>
          <Text variant="body" style={styles.statValue}>
            {clips.length}
          </Text>
        </View>
        <View style={styles.stat}>
          <Text variant="caption" style={styles.statLabel}>
            Status
          </Text>
          <Text variant="body" style={styles.statValue}>
            {project.status}
          </Text>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text variant="body" style={styles.sectionTitle}>
          Audio Segments
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
              No segments yet. Record during a call to add audio.
            </Text>
          </View>
        }
      />

      <View style={styles.footer}>
        <Button
          title="Open Editor"
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
    fontFamily: 'Poppins_600SemiBold',
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionTitle: {
    color: '#888',
    fontFamily: 'Poppins_500Medium',
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
