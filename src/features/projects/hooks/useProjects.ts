import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectService } from '@/lib/api/projectService';
import { useProjectStore } from '@/stores/projectStore';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';

const PROJECTS_KEY = ['projects'];

export function useProjects() {
  const setProjects = useProjectStore((s) => s.setProjects);

  return useQuery({
    queryKey: PROJECTS_KEY,
    queryFn: async () => {
      const projects = await projectService.listProjects();
      setProjects(projects);
      return projects;
    },
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  const addProject = useProjectStore((s) => s.addProject);

  return useMutation({
    mutationFn: ({ name, description }: { name: string; description?: string }) =>
      projectService.createProject(name, description),
    onSuccess: (project) => {
      addProject(project);
      queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
      analytics.capture(ANALYTICS_EVENTS.PROJECT.CREATED, { name: project.name });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  const removeProject = useProjectStore((s) => s.removeProject);

  return useMutation({
    mutationFn: (id: string) => projectService.deleteProject(id),
    onSuccess: (_, id) => {
      removeProject(id);
      queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
      analytics.capture(ANALYTICS_EVENTS.PROJECT.DELETED, { project_id: id });
    },
  });
}
