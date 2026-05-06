import { Controller, Get, Param } from '@nestjs/common';
import { BackgroundJobsService } from './background-jobs.service';

@Controller('jobs')
export class BackgroundJobsController {
  constructor(private readonly jobs: BackgroundJobsService) {}

  @Get(':jobId')
  async getJob(@Param('jobId') jobId: string): Promise<Record<string, unknown>> {
    const job = await this.jobs.getJob(jobId);

    return {
      jobId: job.id,
      type: job.type,
      status: job.status,
      resultRef: job.result,
      error: job.error,
      attempts: job.attempts,
    };
  }
}
