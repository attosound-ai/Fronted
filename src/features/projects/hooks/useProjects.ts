import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectService } from '@/lib/api/projectService';
import { useProjectStore } from '@/stores/projectStore';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import type { Project } from '@/types/project';

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

/**
 * Renames a project. The list shows the new name at once and goes back to the
 * old one if the server refuses.
 */
export function useRenameProject() {
  const queryClient = useQueryClient();
  const updateStored = useProjectStore((s) => s.updateProject);

  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      projectService.updateProject(id, { name }),
    onMutate: async ({ id, name }) => {
      await queryClient.cancelQueries({ queryKey: PROJECTS_KEY });
      const before = queryClient.getQueryData<Project[]>(PROJECTS_KEY);
      queryClient.setQueryData<Project[]>(PROJECTS_KEY, (list) =>
        list?.map((p) => (p.id === id ? { ...p, name } : p))
      );
      return { before };
    },
    onError: (_error, { id }, context) => {
      if (context?.before) queryClient.setQueryData(PROJECTS_KEY, context.before);
      analytics.capture(ANALYTICS_EVENTS.PROJECT.RENAMED, {
        project_id: id,
        outcome: 'failed',
      });
    },
    onSuccess: (project, { id, name }) => {
      updateStored(id, { name: project?.name ?? name });
      queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
      // The editor reads the name from the project itself.
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      analytics.capture(ANALYTICS_EVENTS.PROJECT.RENAMED, {
        project_id: id,
        outcome: 'renamed',
      });
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
