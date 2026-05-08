import { defineStore } from 'pinia';
import { apiRequest } from '@/shared/api/client';
import { realtimeClient } from '@/shared/api/realtime';
import type { JobRef } from '@/types';

interface JobState extends JobRef {
  error?: unknown;
  resultRef?: unknown;
}

export const useBackgroundJobStore = defineStore('backgroundJobStore', {
  state: () => ({
    jobs: {} as Record<string, JobState>,
  }),
  getters: {
    processing: (state) =>
      Object.values(state.jobs).some((job) => job.status === 'queued' || job.status === 'running'),
  },
  actions: {
    track(job: JobRef) {
      this.jobs[job.jobId] = { ...job };
    },
    async refresh(jobId: string) {
      const job = await apiRequest<JobState>(`/jobs/${jobId}`);
      this.jobs[jobId] = job;
      return job;
    },
    async poll(jobIds: string[], onComplete?: () => Promise<void>) {
      await Promise.all(jobIds.map((jobId) => this.pollOne(jobId)));
      if (onComplete) await onComplete();
    },
    async pollOne(jobId: string) {
      const initial = await this.refresh(jobId);
      if (initial.status === 'completed' || initial.status === 'failed' || initial.status === 'cancelled') {
        return initial;
      }

      return await new Promise<JobState>((resolve) => {
        const timeout = window.setTimeout(() => {
          unsubscribe();
          void this.refresh(jobId).then(resolve);
        }, 120000);

        const unsubscribe = realtimeClient.subscribe((event) => {
          if (event.channel !== 'background-job-updated' || event.jobId !== jobId) return;
          void this.refresh(jobId).then((job) => {
            if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
              window.clearTimeout(timeout);
              unsubscribe();
              resolve(job);
            }
          });
        });
      });
    },
  },
});
