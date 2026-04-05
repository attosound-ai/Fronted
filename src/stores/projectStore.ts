import { create } from 'zustand';
import type { Project } from '@/types/project';

interface ProjectStoreState {
  projects: Project[];
  activeProjectId: string | null;
  isLoading: boolean;
}

interface ProjectStoreActions {
  setProjects: (projects: Project[]) => void;
  addProject: (project: Project) => void;
  removeProject: (id: string) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  setActiveProjectId: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useProjectStore = create<ProjectStoreState & ProjectStoreActions>((set) => ({
  projects: [],
  activeProjectId: null,
  isLoading: false,

  setProjects: (projects) => set({ projects }),

  addProject: (project) => set((state) => ({ projects: [project, ...state.projects] })),

  removeProject: (id) =>
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
    })),

  updateProject: (id, updates) =>
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    })),

  setActiveProjectId: (id) => set({ activeProjectId: id }),

  setLoading: (loading) => set({ isLoading: loading }),
}));
