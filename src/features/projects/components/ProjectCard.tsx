import { View, StyleSheet, Pressable } from 'react-native';
import { Music, ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import type { Project } from '@/types/project';

interface ProjectCardProps {
  project: Project;
  onPress: () => void;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function ProjectCard({ project, onPress }: ProjectCardProps) {
  const { t } = useTranslation('projects');
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <View style={styles.iconContainer}>
        <Music size={24} color="#FFFFFF" strokeWidth={2.25} />
      </View>
      <View style={styles.info}>
        <Text variant="body" style={styles.name} numberOfLines={1}>
          {project.name}
        </Text>
        <View style={styles.meta}>
          <Text variant="caption" style={styles.metaText}>
            {project.segmentCount}{' '}
            {project.segmentCount !== 1 ? t('card.trackPlural') : t('card.trackSingular')}
          </Text>
          <View style={styles.dot} />
          <Text variant="caption" style={styles.metaText}>
            {formatDuration(project.totalDurationMs)}
          </Text>
          <View style={styles.dot} />
          <Text variant="caption" style={styles.metaText}>
            {formatDate(project.updatedAt)}
          </Text>
        </View>
      </View>
      <ChevronRight size={20} color="#444" strokeWidth={2.25} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    gap: 12,
  },
  cardPressed: {
    opacity: 0.7,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 4,
  },
  name: {
    color: '#FFF',
    fontFamily: 'Archivo_500Medium',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    color: '#666',
    fontSize: 12,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#444',
  },
});
