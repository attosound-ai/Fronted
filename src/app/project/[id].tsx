import { useLocalSearchParams } from 'expo-router';
import { ProjectDetailScreen } from '@/features/projects/components/ProjectDetailScreen';

export default function ProjectDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProjectDetailScreen projectId={id} />;
}
