import { useState } from 'react';
import { View, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Text } from '@/components/ui/Text';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { showToast } from '@/components/ui/Toast';
import { useProjects, useCreateProject } from '@/features/projects/hooks/useProjects';
import { useCallStore } from '@/stores/callStore';

interface ProjectPickerSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function ProjectPickerSheet({ visible, onClose }: ProjectPickerSheetProps) {
  const { t } = useTranslation(['calls', 'common']);
  const { data: projects, isLoading } = useProjects();
  const createProject = useCreateProject();
  const setActiveProjectId = useCallStore((s) => s.setActiveProjectId);

  const [mode, setMode] = useState<'list' | 'create'>('list');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleClose = () => {
    setMode('list');
    setName('');
    setDescription('');
    onClose();
  };

  const handleSelectProject = (projectId: string) => {
    setActiveProjectId(projectId);
    handleClose();
    router.push('/recording');
  };

  const handleCreateSubmit = () => {
    if (!name.trim()) return;
    createProject.mutate(
      { name: name.trim(), description: description.trim() || undefined },
      {
        onSuccess: (project) => {
          setActiveProjectId(project.id);
          handleClose();
          router.push('/recording');
        },
        onError: () => {
          showToast(t('common:toasts.failedToCreateProject'));
        },
      }
    );
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title={
        mode === 'list' ? t('projectPicker.selectProject') : t('projectPicker.newProject')
      }
    >
      {mode === 'list' ? (
        <>
          <Text variant="caption" style={styles.subtitle}>
            {t('projectPicker.subtitle')}
          </Text>

          {isLoading ? (
            <ActivityIndicator color="#3B82F6" style={styles.loader} />
          ) : (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {/* Create new project option */}
              <Pressable style={styles.option} onPress={() => setMode('create')}>
                <View style={[styles.iconCircle, styles.createCircle]}>
                  <Ionicons name="add" size={22} color="#3B82F6" />
                </View>
                <View style={styles.textContainer}>
                  <Text variant="body" style={styles.createText}>
                    {t('projectPicker.newProject')}
                  </Text>
                </View>
              </Pressable>

              {/* Existing projects */}
              {projects?.map((project) => (
                <Pressable
                  key={project.id}
                  style={styles.option}
                  onPress={() => handleSelectProject(project.id)}
                >
                  <View style={styles.iconCircle}>
                    <Ionicons name="folder" size={20} color="#FFF" />
                  </View>
                  <View style={styles.textContainer}>
                    <Text variant="body" style={styles.projectName} numberOfLines={1}>
                      {project.name}
                    </Text>
                    {(project.segmentCount ?? 0) > 0 && (
                      <Text variant="caption" style={styles.meta}>
                        {t('projectPicker.segmentCount', { count: project.segmentCount })}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#555" />
                </Pressable>
              ))}

              {(!projects || projects.length === 0) && !isLoading && (
                <Text variant="caption" style={styles.emptyText}>
                  {t('projectPicker.noProjects')}
                </Text>
              )}
            </ScrollView>
          )}
        </>
      ) : (
        /* Create mode — inline form */
        <View style={styles.createForm}>
          <Pressable style={styles.backButton} onPress={() => setMode('list')}>
            <Ionicons name="arrow-back" size={20} color="#888" />
            <Text variant="caption" style={styles.backText}>
              {t('common:buttons.back')}
            </Text>
          </Pressable>
          <Input
            placeholder={t('projectPicker.projectName')}
            value={name}
            onChangeText={setName}
            maxLength={200}
            autoFocus
          />
          <Input
            placeholder={t('projectPicker.descriptionPlaceholder')}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            style={styles.descriptionInput}
          />
          <Button
            title={t('common:buttons.create')}
            onPress={handleCreateSubmit}
            disabled={!name.trim() || createProject.isPending}
            loading={createProject.isPending}
          />
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    color: '#888',
    textAlign: 'center',
    marginBottom: 16,
    fontSize: 13,
  },
  loader: {
    marginVertical: 32,
  },
  list: {
    maxHeight: 300,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createCircle: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  textContainer: {
    flex: 1,
    marginLeft: 12,
  },
  createText: {
    color: '#3B82F6',
    fontSize: 15,
    fontFamily: 'Archivo_500Medium',
  },
  projectName: {
    color: '#FFF',
    fontSize: 15,
    fontFamily: 'Archivo_500Medium',
  },
  meta: {
    color: '#666',
    fontSize: 11,
    marginTop: 2,
  },
  emptyText: {
    color: '#555',
    textAlign: 'center',
    marginTop: 20,
    fontSize: 13,
  },
  createForm: {
    gap: 16,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  backText: {
    color: '#888',
    fontSize: 13,
  },
  descriptionInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
});
