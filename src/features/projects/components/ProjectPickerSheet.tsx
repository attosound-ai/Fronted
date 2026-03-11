import { ScrollView, TouchableOpacity, View, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Text } from '@/components/ui/Text';
import { useProjects } from '../hooks/useProjects';

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

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('picker.title', 'Mis Proyectos')}>
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#3B82F6" />
        </View>
      ) : !projects?.length ? (
        <View style={styles.center}>
          <Ionicons name="folder-open-outline" size={40} color="#555" />
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
                <Ionicons name="musical-notes" size={20} color="#3B82F6" />
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
              <Ionicons name="chevron-forward" size={18} color="#555" />
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
    backgroundColor: '#1E3A5F',
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
