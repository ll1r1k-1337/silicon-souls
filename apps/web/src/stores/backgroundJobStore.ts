import { defineStore } from 'pinia';
import { apiRequest } from '@/shared/api/client';
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
      for (const jobId of jobIds) {
        await this.pollOne(jobId);
      }
      if (onComplete) {
        await onComplete();
      }
    },
    async pollOne(jobId: string) {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const job = await this.refresh(jobId);
        if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
          return job;
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      return this.jobs[jobId];
    },
  },
});
