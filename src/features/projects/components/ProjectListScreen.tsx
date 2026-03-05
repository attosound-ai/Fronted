import { useState, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { Toast, showToast } from '@/components/ui/Toast';
import { ProjectCard } from './ProjectCard';
import { EmptyProjectsState } from './EmptyProjectsState';
import { CreateProjectSheet } from './CreateProjectSheet';
import { useProjects, useCreateProject } from '../hooks/useProjects';
import type { Project } from '@/types/project';

export function ProjectListScreen() {
  const { data: projects, isLoading, refetch } = useProjects();
  const createProject = useCreateProject();
  const [sheetVisible, setSheetVisible] = useState(false);

  const handleCreate = useCallback(
    (name: string, description?: string) => {
      createProject.mutate(
        { name, description },
        {
          onSuccess: (project) => {
            setSheetVisible(false);
            router.push(`/project/${project.id}`);
          },
          onError: () => {
            showToast('Failed to create project');
          },
        },
      );
    },
    [createProject],
  );

  const handleProjectPress = useCallback((project: Project) => {
    router.push(`/project/${project.id}`);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Project }) => (
      <ProjectCard project={item} onPress={() => handleProjectPress(item)} />
    ),
    [handleProjectPress],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text variant="h2" style={styles.title}>
          Projects
        </Text>
        <Pressable
          style={styles.addButton}
          onPress={() => setSheetVisible(true)}
        >
          <Ionicons name="add" size={32} color="#000" />
        </Pressable>
      </View>

      <FlatList
        data={projects ?? []}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={
          !projects?.length ? styles.emptyContainer : styles.listContent
        }
        ListEmptyComponent={isLoading ? null : <EmptyProjectsState />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refetch}
            tintColor="#3B82F6"
          />
        }
      />

      <CreateProjectSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onSubmit={handleCreate}
        isLoading={createProject.isPending}
      />
      <Toast />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    color: '#FFF',
  },
  addButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingVertical: 8,
    gap: 8,
  },
  emptyContainer: {
    flex: 1,
  },
  separator: {
    height: 8,
  },
});
