import { Injectable } from '@nestjs/common';
import { desc, eq, or, sql } from 'drizzle-orm';
import { DatabaseService } from '../../shared/database/database.service';
import {
  backgroundJobs,
  eventStore,
  llmInvocations,
} from '../../shared/database/schema';

export interface SystemLogsQuery {
  sessionId?: string;
  limit?: number;
}

export interface SystemLogsResponse {
  generatedAt: string;
  jobs: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  llmInvocations: Array<Record<string, unknown>>;
}

@Injectable()
export class SystemLogsService {
  constructor(private readonly database: DatabaseService) {}

  async getLogs(query: SystemLogsQuery): Promise<SystemLogsResponse> {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
    const [jobs, events, invocations] = await Promise.all([
      this.getJobs(query.sessionId, limit),
      this.getEvents(query.sessionId, limit),
      this.getLlmInvocations(query.sessionId, limit),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      jobs: jobs.map((job) => ({
        id: job.id,
        type: job.type,
        status: job.status,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        lockedBy: job.lockedBy ?? undefined,
        runAfter: job.runAfter.toISOString(),
        lockedAt: job.lockedAt?.toISOString(),
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
        payload: job.payload,
        result: job.result ?? undefined,
        error: job.error ?? undefined,
      })),
      events: events.map((event) => ({
        id: event.id,
        aggregateId: event.aggregateId,
        aggregateType: event.aggregateType,
        eventType: event.eventType,
        eventVersion: event.eventVersion,
        payload: event.payload,
        metadata: event.metadata,
        createdAt: event.createdAt.toISOString(),
      })),
      llmInvocations: invocations.map((invocation) => ({
        id: invocation.id,
        traceId: invocation.traceId,
        projectId: invocation.projectId,
        sessionId: invocation.sessionId,
        chainName: invocation.chainName,
        provider: invocation.provider,
        model: invocation.model,
        promptVersion: invocation.promptVersion,
        status: invocation.status,
        durationMs: invocation.durationMs ?? undefined,
        inputTokens: invocation.inputTokens ?? undefined,
        outputTokens: invocation.outputTokens ?? undefined,
        totalTokens: invocation.totalTokens ?? undefined,
        errorCode: invocation.errorCode ?? undefined,
        metadata: invocation.metadata,
        createdAt: invocation.createdAt.toISOString(),
      })),
    };
  }

  private async getJobs(sessionId: string | undefined, limit: number) {
    if (!sessionId) {
      return this.database.db
        .select()
        .from(backgroundJobs)
        .orderBy(desc(backgroundJobs.updatedAt))
        .limit(limit);
    }

    return this.database.db
      .select()
      .from(backgroundJobs)
      .where(sql`${backgroundJobs.payload}->>'sessionId' = ${sessionId}`)
      .orderBy(desc(backgroundJobs.updatedAt))
      .limit(limit);
  }

  private async getEvents(sessionId: string | undefined, limit: number) {
    if (!sessionId) {
      return this.database.db
        .select()
        .from(eventStore)
        .orderBy(desc(eventStore.createdAt))
        .limit(limit);
    }

    return this.database.db
      .select()
      .from(eventStore)
      .where(
        or(
          eq(eventStore.aggregateId, sessionId),
          sql`${eventStore.payload}->>'sessionId' = ${sessionId}`,
          sql`${eventStore.metadata}->>'sessionId' = ${sessionId}`,
        ),
      )
      .orderBy(desc(eventStore.createdAt))
      .limit(limit);
  }

  private async getLlmInvocations(sessionId: string | undefined, limit: number) {
    if (!sessionId) {
      return this.database.db
        .select()
        .from(llmInvocations)
        .orderBy(desc(llmInvocations.createdAt))
        .limit(limit);
    }

    return this.database.db
      .select()
      .from(llmInvocations)
      .where(eq(llmInvocations.sessionId, sessionId))
      .orderBy(desc(llmInvocations.createdAt))
      .limit(limit);
  }
}
