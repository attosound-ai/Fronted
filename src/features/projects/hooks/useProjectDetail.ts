import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { projectService } from '@/lib/api/projectService';

export function useProjectDetail(projectId: string) {
  const queryClient = useQueryClient();

  useFocusEffect(
    useCallback(() => {
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      }
    }, [projectId, queryClient])
  );

  return useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectService.getProject(projectId),
    enabled: !!projectId,
  });
}
