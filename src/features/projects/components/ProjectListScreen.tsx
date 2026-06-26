import { useState, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  Pressable,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { ChevronLeft, Plus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { CollapsibleHeader } from '@/components/ui/CollapsibleHeader';
import { useCollapsibleHeader } from '@/hooks/useCollapsibleHeader';
import { Text } from '@/components/ui/Text';
import { Toast, showToast } from '@/components/ui/Toast';
import { ProjectCard } from './ProjectCard';
import { EmptyProjectsState } from './EmptyProjectsState';
import { CreateProjectSheet } from './CreateProjectSheet';
import { useProjects, useCreateProject } from '../hooks/useProjects';
import type { Project } from '@/types/project';
import { COLORS } from '@/constants/theme';

export function ProjectListScreen() {
  const { t } = useTranslation('projects');
  const { data: projects, isLoading, refetch } = useProjects();
  const createProject = useCreateProject();
  const [sheetVisible, setSheetVisible] = useState(false);
  const header = useCollapsibleHeader();

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
            showToast(t('list.errorCreateFailed'));
          },
        }
      );
    },
    [createProject]
  );

  const handleProjectPress = useCallback((project: Project) => {
    router.push(`/project/${project.id}`);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Project }) => (
      <ProjectCard project={item} onPress={() => handleProjectPress(item)} />
    ),
    [handleProjectPress]
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={projects ?? []}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onScroll={header.onScroll}
        scrollEventThrottle={header.scrollEventThrottle}
        contentContainerStyle={[
          !projects?.length ? styles.emptyContainer : styles.listContent,
          { paddingTop: header.height },
        ]}
        ListEmptyComponent={isLoading ? null : <EmptyProjectsState />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refetch}
            tintColor="#3B82F6"
            progressViewOffset={header.height}
          />
        }
      />

      <CreateProjectSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onSubmit={handleCreate}
        isLoading={createProject.isPending}
      />
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.8}
        onPress={() => setSheetVisible(true)}
      >
        <Plus size={28} color="#000" strokeWidth={2.25} />
      </TouchableOpacity>
      <Toast />
      <CollapsibleHeader animatedStyle={header.animatedStyle}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ChevronLeft size={28} color="#FFF" strokeWidth={2.25} />
        </TouchableOpacity>
        <Text variant="h2" style={styles.title}>
          {t('list.title')}
        </Text>
        <View style={{ width: 28 }} />
      </CollapsibleHeader>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background.primary,
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
  fab: {
    position: 'absolute',
    bottom: 64,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
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
