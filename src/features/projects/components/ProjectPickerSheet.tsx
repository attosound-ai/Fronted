import { useState } from 'react';
import {
  ScrollView,
  TouchableOpacity,
  View,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Plus, FolderOpen, Music, ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { useProjects, useCreateProject } from '../hooks/useProjects';
import { haptic } from '@/lib/haptics/hapticService';

interface ProjectPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (projectId: string) => void;
}

function formatDuration(ms?: number): string {
  if (!ms) return '';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function ProjectPickerSheet({ visible, onClose, onSelect }: ProjectPickerSheetProps) {
  const { t } = useTranslation('projects');
  const { data: projects, isLoading } = useProjects();
  const createProject = useCreateProject();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');

  const handleCreate = () => {
    if (!newName.trim()) return;
    haptic('light');
    createProject.mutate(
      { name: newName.trim() },
      {
        onSuccess: (project) => {
          setNewName('');
          setShowCreate(false);
          onClose();
          onSelect(project.id);
        },
      }
    );
  };

  const handleClose = () => {
    setShowCreate(false);
    setNewName('');
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={handleClose} title={t('picker.title', 'Mis Proyectos')}>
      {/* Create new project section */}
      {showCreate ? (
        <View style={styles.createSection}>
          <TextInput
            style={styles.createInput}
            placeholder={t('picker.namePlaceholder', 'Project name')}
            placeholderTextColor="#666666"
            value={newName}
            onChangeText={setNewName}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.createButtons}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                setShowCreate(false);
                setNewName('');
              }}
            >
              <Text style={styles.cancelText}>{t('picker.cancel', 'Cancel')}</Text>
            </TouchableOpacity>
            <Button
              title={t('picker.create', 'Create')}
              onPress={handleCreate}
              disabled={!newName.trim() || createProject.isPending}
              loading={createProject.isPending}
            />
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.newProjectRow}
          onPress={() => setShowCreate(true)}
          activeOpacity={0.7}
        >
          <View style={styles.newIconWrap}>
            <Plus size={20} color="#FFFFFF" strokeWidth={2.25} />
          </View>
          <Text style={styles.newProjectText}>
            {t('picker.newProject', 'New project')}
          </Text>
        </TouchableOpacity>
      )}

      {/* Separator */}
      {(projects?.length ?? 0) > 0 && <View style={styles.separator} />}

      {/* Project list */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      ) : !projects?.length ? (
        <View style={styles.center}>
          <FolderOpen size={40} color="#555" strokeWidth={2.25} />
          <Text style={styles.emptyText}>{t('picker.empty', 'No tienes proyectos aún')}</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} style={styles.list}>
          {projects.map((project) => (
            <TouchableOpacity
              key={project.id}
              style={styles.item}
              activeOpacity={0.7}
              onPress={() => {
                onClose();
                onSelect(project.id);
              }}
            >
              <View style={styles.iconWrap}>
                <Music size={20} color="#FFFFFF" strokeWidth={2.25} />
              </View>
              <View style={styles.info}>
                <Text style={styles.name} numberOfLines={1}>
                  {project.name}
                </Text>
                <Text style={styles.meta}>
                  {project.segmentCount ?? 0} {t('picker.segments', 'grabaciones')}
                  {project.totalDurationMs
                    ? `  ·  ${formatDuration(project.totalDurationMs)}`
                    : ''}
                </Text>
              </View>
              <ChevronRight size={18} color="#555" strokeWidth={2.25} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: {
    marginTop: 4,
  },
  center: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  emptyText: {
    color: '#888',
    fontSize: 14,
  },
  newProjectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  newIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#333333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newProjectText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Archivo_500Medium',
  },
  separator: {
    height: 1,
    backgroundColor: '#222222',
    marginVertical: 4,
  },
  createSection: {
    gap: 12,
    paddingVertical: 8,
  },
  createInput: {
    backgroundColor: '#111111',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#222222',
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Archivo_400Regular',
  },
  createButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  cancelText: {
    color: '#888888',
    fontSize: 15,
    fontFamily: 'Archivo_500Medium',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2A2A2A',
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#222222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: '#FFF',
    fontSize: 15,
    fontFamily: 'Archivo_600SemiBold',
  },
  meta: {
    color: '#888',
    fontSize: 12,
    fontFamily: 'Archivo_400Regular',
  },
});
