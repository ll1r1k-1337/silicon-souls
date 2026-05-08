import { defineStore } from 'pinia';
import { apiRequest } from '@/shared/api/client';
import type { SystemLogsResponse } from '@/types';

export const useSystemLogStore = defineStore('systemLogStore', {
  state: () => ({
    logs: undefined as SystemLogsResponse | undefined,
    loading: false,
    error: undefined as string | undefined,
  }),
  getters: {
    activeJobCount: (state) =>
      state.logs?.jobs.filter((job) => job.status === 'queued' || job.status === 'running')
        .length ?? 0,
  },
  actions: {
    async load(sessionId?: string) {
      this.loading = true;
      this.error = undefined;
      const params = new URLSearchParams({ limit: '50' });
      if (sessionId) {
        params.set('sessionId', sessionId);
      }

      try {
        this.logs = await apiRequest<SystemLogsResponse>(`/system/logs?${params.toString()}`);
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        this.loading = false;
      }
    },
  },
});
