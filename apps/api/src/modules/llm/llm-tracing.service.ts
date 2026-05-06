import { Injectable } from '@nestjs/common';
import { createPrefixedId } from '@sdd/domain';
import { DatabaseService } from '../../shared/database/database.service';
import { llmInvocations } from '../../shared/database/schema';
import type { LlmProvider, LlmRequestContext } from './llm.interfaces';

@Injectable()
export class LlmTracingService {
  constructor(private readonly database: DatabaseService) {}

  async record(params: {
    context: LlmRequestContext;
    provider: LlmProvider;
    promptVersion: string;
    status: 'completed' | 'failed';
    durationMs: number;
    errorCode?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.database.db.insert(llmInvocations).values({
      id: createPrefixedId('llm'),
      traceId: params.context.traceId,
      projectId: params.context.projectId,
      sessionId: params.context.sessionId,
      chainName: params.context.chainName,
      provider: params.provider.providerName,
      model: params.provider.modelName,
      promptVersion: params.promptVersion,
      status: params.status,
      durationMs: params.durationMs,
      errorCode: params.errorCode,
      metadata: params.metadata ?? {},
      createdAt: new Date(),
    });
  }
}
