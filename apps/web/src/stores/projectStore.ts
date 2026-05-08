import { defineStore } from 'pinia';
import type { Project } from '@sdd/domain';
import { apiRequest } from '@/shared/api/client';

export const useProjectStore = defineStore('projectStore', {
  state: () => ({
    projects: [] as Project[],
    currentProject: undefined as Project | undefined,
    loading: false,
    error: undefined as string | undefined,
  }),
  actions: {
    async loadProjects() {
      this.loading = true;
      this.error = undefined;
      try {
        const response = await apiRequest<{ projects: Project[] }>('/projects');
        this.projects = response.projects;
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        this.loading = false;
      }
    },
    async createProject(input: { name: string; description?: string }) {
      const response = await apiRequest<{ project: Project }>('/projects', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      this.currentProject = response.project;
      await this.loadProjects();
      return response.project;
    },
    async deleteProject(projectId: string) {
      await apiRequest<{ deleted: boolean; projectId: string }>(`/projects/${projectId}`, {
        method: 'DELETE',
      });
      if (this.currentProject?.id === projectId) {
        this.currentProject = undefined;
      }
      this.projects = this.projects.filter((project) => project.id !== projectId);
    },
    async loadProject(projectId: string) {
      const response = await apiRequest<{ project: Project }>(`/projects/${projectId}`);
      this.currentProject = response.project;
      return response.project;
    },
  },
});
