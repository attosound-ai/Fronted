import { useLocalSearchParams } from 'expo-router';
import { ProjectDetailScreen } from '@/features/projects/components/ProjectDetailScreen';

export default function ProjectDetailRoute() {
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  return <ProjectDetailScreen projectId={id} publishMode={mode === 'publish'} />;
}
