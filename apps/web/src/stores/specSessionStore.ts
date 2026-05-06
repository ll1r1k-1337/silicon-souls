import { defineStore } from 'pinia';
import type { SpecArtifact } from '@sdd/domain';
import { apiRequest } from '@/shared/api/client';
import type { JobRef, WorkspaceState } from '@/types';
import { useBackgroundJobStore } from './backgroundJobStore';
import { useLocalDraftStore } from './localDraftStore';

export const useSpecSessionStore = defineStore('specSessionStore', {
  state: () => ({
    workspace: undefined as WorkspaceState | undefined,
    loading: false,
    error: undefined as string | undefined,
  }),
  getters: {
    session: (state) => state.workspace?.session,
    document: (state) => state.workspace?.document,
    artifacts: (state) => state.workspace?.artifacts ?? [],
    review: (state) => state.workspace?.review,
    versions: (state) => state.workspace?.versions ?? [],
    canApprove: (state) => Boolean(state.workspace?.review?.canApprove),
  },
  actions: {
    async startSession(projectId: string, rawIdea: string) {
      const response = await apiRequest<{ sessionId: string }>(
        `/projects/${projectId}/spec-sessions`,
        {
          method: 'POST',
          body: JSON.stringify({ rawIdea }),
        },
      );
      await this.loadWorkspace(response.sessionId);
      return response.sessionId;
    },
    async loadWorkspace(sessionId: string) {
      this.loading = true;
      this.error = undefined;
      try {
        this.workspace = await apiRequest<WorkspaceState>(`/spec-sessions/${sessionId}`);
        const drafts = useLocalDraftStore();
        drafts.hydrate(sessionId);
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        this.loading = false;
      }
    },
    async sendMessage(message: string) {
      if (!this.workspace) return;
      const response = await apiRequest<{ jobs: JobRef[] }>(
        `/spec-sessions/${this.workspace.session.id}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({ message }),
        },
      );
      const jobStore = useBackgroundJobStore();
      response.jobs.forEach((job) => jobStore.track(job));
      await this.loadWorkspace(this.workspace.session.id);
      void jobStore.poll(
        response.jobs.map((job) => job.jobId),
        async () => this.workspace && this.loadWorkspace(this.workspace.session.id),
      );
    },
    async generateDraft() {
      await this.enqueueAndPoll('generate-draft');
    },
    async reviewSpec() {
      await this.enqueueAndPoll('review');
    },
    async approveSpec() {
      if (!this.workspace) return;
      await apiRequest(`/spec-sessions/${this.workspace.session.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await this.loadWorkspace(this.workspace.session.id);
    },
    async saveDocument(markdown: string, changeSummary = 'Direct markdown edit') {
      if (!this.workspace) return;
      await apiRequest(`/spec-sessions/${this.workspace.session.id}/document`, {
        method: 'PATCH',
        body: JSON.stringify({
          markdown,
          baseVersionId: this.workspace.session.currentVersionId,
          changeSummary,
        }),
      });
      useLocalDraftStore().clearDraft(this.workspace.session.id);
      await this.loadWorkspace(this.workspace.session.id);
    },
    async updateArtifact(artifact: SpecArtifact, action: 'confirm' | 'reject' | 'edit') {
      await apiRequest(`/spec-artifacts/${artifact.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      });
      if (this.workspace) {
        await this.loadWorkspace(this.workspace.session.id);
      }
    },
    async enqueueAndPoll(action: 'generate-draft' | 'review') {
      if (!this.workspace) return;
      const response = await apiRequest<JobRef>(
        `/spec-sessions/${this.workspace.session.id}/${action}`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      const jobStore = useBackgroundJobStore();
      jobStore.track(response);
      void jobStore.poll([response.jobId], async () => {
        if (this.workspace) {
          await this.loadWorkspace(this.workspace.session.id);
        }
      });
    },
  },
});
