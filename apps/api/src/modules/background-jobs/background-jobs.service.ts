import { Injectable } from '@nestjs/common';
import { createPrefixedId, nowIso, type BackgroundJobType } from '@sdd/domain';
import { and, asc, eq, lte } from 'drizzle-orm';
import { DatabaseService } from '../../shared/database/database.service';
import { backgroundJobs, type BackgroundJobRow } from '../../shared/database/schema';
import { EventStoreService } from '../../shared/events/event-store.service';
import { RealtimeEventsService } from '../../shared/events/realtime-events.service';
import { throwNotFound } from '../../shared/errors/not-found';

@Injectable()
export class BackgroundJobsService {
  private readonly staleRunningJobMs = 5 * 60 * 1000;

  constructor(
    private readonly database: DatabaseService,
    private readonly events: EventStoreService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  async createJob(params: {
    type: BackgroundJobType;
    payload: Record<string, unknown>;
    runAfter?: Date;
    maxAttempts?: number;
  }): Promise<BackgroundJobRow> {
    const now = new Date(nowIso());
    const [job] = await this.database.db
      .insert(backgroundJobs)
      .values({
        id: createPrefixedId('job'),
        type: params.type,
        status: 'queued',
        payload: params.payload,
        attempts: 0,
        maxAttempts: params.maxAttempts ?? 2,
        runAfter: params.runAfter ?? now,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await this.events.append({
      aggregateId: job.id,
      aggregateType: 'background_job',
      eventType: 'llm_job.created',
      payload: { type: job.type, status: job.status },
    });
    this.publishUpdate(job.id, job.payload);

    return job;
  }

  async getJob(id: string): Promise<BackgroundJobRow> {
    const [job] = await this.database.db
      .select()
      .from(backgroundJobs)
      .where(eq(backgroundJobs.id, id))
      .limit(1);

    if (!job) {
      throwNotFound('Background job', id);
    }

    return job;
  }

  async claimNext(workerId: string): Promise<BackgroundJobRow | undefined> {
    await this.requeueStaleRunningJobs();

    const [candidate] = await this.database.db
      .select()
      .from(backgroundJobs)
      .where(
        and(eq(backgroundJobs.status, 'queued'), lte(backgroundJobs.runAfter, new Date())),
      )
      .orderBy(asc(backgroundJobs.createdAt))
      .limit(1);

    if (!candidate) {
      return undefined;
    }

    const [job] = await this.database.db
      .update(backgroundJobs)
      .set({
        status: 'running',
        lockedAt: new Date(),
        lockedBy: workerId,
        attempts: candidate.attempts + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(backgroundJobs.id, candidate.id), eq(backgroundJobs.status, 'queued')))
      .returning();

    return job;
  }

  private async requeueStaleRunningJobs(): Promise<void> {
    await this.database.db
      .update(backgroundJobs)
      .set({
        status: 'queued',
        lockedAt: null,
        lockedBy: null,
        runAfter: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(backgroundJobs.status, 'running'),
          lte(backgroundJobs.lockedAt, new Date(Date.now() - this.staleRunningJobMs)),
        ),
      );
  }

  async completeJob(id: string, result: Record<string, unknown>): Promise<void> {
    await this.database.db
      .update(backgroundJobs)
      .set({
        status: 'completed',
        result,
        error: null,
        lockedAt: null,
        lockedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(backgroundJobs.id, id));

    await this.events.append({
      aggregateId: id,
      aggregateType: 'background_job',
      eventType: 'llm_job.completed',
      payload: result,
    });
    this.publishUpdate(id, result);
  }

  async failJob(id: string, error: unknown): Promise<void> {
    const job = await this.getJob(id);
    const finalFailure = job.attempts >= job.maxAttempts;

    await this.database.db
      .update(backgroundJobs)
      .set({
        status: finalFailure ? 'failed' : 'queued',
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
        lockedAt: null,
        lockedBy: null,
        runAfter: finalFailure ? job.runAfter : new Date(Date.now() + 2000),
        updatedAt: new Date(),
      })
      .where(eq(backgroundJobs.id, id));

    await this.events.append({
      aggregateId: id,
      aggregateType: 'background_job',
      eventType: finalFailure ? 'llm_job.failed' : 'llm_job.created',
      payload: {
        error: error instanceof Error ? error.message : String(error),
        willRetry: !finalFailure,
      },
    });
    this.publishUpdate(id, { sessionId: job.payload.sessionId as string | undefined });
  }

  private publishUpdate(jobId: string, payload: Record<string, unknown>): void {
    this.realtimeEvents.emit({
      channel: 'background-job-updated',
      jobId,
      sessionId: typeof payload.sessionId === 'string' ? payload.sessionId : undefined,
    });
  }
}
