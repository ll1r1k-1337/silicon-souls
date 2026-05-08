import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../../shared/database/database.service';
import { specArtifacts } from '../../shared/database/schema';
import { EventStoreService } from '../../shared/events/event-store.service';
import { throwNotFound } from '../../shared/errors/not-found';
import { SpecSessionsService } from '../spec-sessions/spec-sessions.service';

function normalizeAnswer(payload: Record<string, unknown>): string {
  if (typeof payload.answer === 'string') {
    return payload.answer.trim();
  }

  if (Array.isArray(payload.selectedAnswers)) {
    const selected = payload.selectedAnswers
      .filter((answer): answer is string => typeof answer === 'string')
      .map((answer) => answer.trim())
      .filter(Boolean);
    const customAnswer =
      typeof payload.customAnswer === 'string' ? payload.customAnswer.trim() : '';
    return [...selected, customAnswer]
      .filter((answer) => answer && !/^other\b/i.test(answer))
      .join('\n');
  }

  return '';
}

function openQuestionAnswerMessage(params: {
  artifactId: string;
  payload: Record<string, unknown>;
  answer: string;
}): string {
  return [
    '[Open question answer]',
    `Question artifact: ${params.artifactId}`,
    `Question: ${String(params.payload.question ?? 'Unknown question')}`,
    `Why it matters: ${String(params.payload.whyItMatters ?? 'Not specified')}`,
    '',
    'Answer:',
    params.answer,
  ].join('\n');
}

function hasOwnStatus(payload: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(payload, 'status');
}

@Injectable()
export class SpecArtifactsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly events: EventStoreService,
    private readonly sessions: SpecSessionsService,
  ) {}

  async updateArtifact(
    artifactId: string,
    input: {
      action?: 'confirm' | 'reject' | 'edit';
      payload?: Record<string, unknown>;
      status?: string;
    },
  ): Promise<Record<string, unknown>> {
    const [artifact] = await this.database.db
      .select()
      .from(specArtifacts)
      .where(eq(specArtifacts.id, artifactId))
      .limit(1);

    if (!artifact) {
      throwNotFound('Spec artifact', artifactId);
    }

    const nextStatus =
      input.status ??
      (input.action === 'confirm'
        ? 'confirmed'
        : input.action === 'reject'
          ? 'rejected'
          : artifact.status);
    const previousPayload = artifact.payload as Record<string, unknown>;
    const inputPayload = input.payload ?? {};
    const payload = {
      ...artifact.payload,
      ...inputPayload,
    };
    const previousAnswer = normalizeAnswer(previousPayload);
    const nextAnswer = normalizeAnswer(payload);

    if (hasOwnStatus(inputPayload)) {
      payload.status = inputPayload.status;
    } else if (artifact.artifactType !== 'open_question' && (input.status || input.action)) {
      payload.status = nextStatus;
    }

    const [updated] = await this.database.db
      .update(specArtifacts)
      .set({
        status: nextStatus,
        payload,
        updatedAt: new Date(),
      })
      .where(eq(specArtifacts.id, artifactId))
      .returning();

    const eventType =
      input.action === 'confirm'
        ? 'spec_artifact.confirmed'
        : input.action === 'reject'
          ? 'spec_artifact.rejected'
          : 'spec_artifact.edited';
    await this.events.append({
      aggregateId: artifact.sessionId,
      aggregateType: 'spec_session',
      eventType,
      payload: {
        artifactId,
        artifactType: artifact.artifactType,
        status: nextStatus,
      },
    });

    const reaction =
      artifact.artifactType === 'open_question' &&
      nextAnswer &&
      nextAnswer !== previousAnswer
        ? await this.sessions.sendUserMessage(
            artifact.sessionId,
            openQuestionAnswerMessage({
              artifactId,
              payload,
              answer: nextAnswer,
            }),
          )
        : undefined;

    return {
      artifact: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
      ...(reaction ? { reaction } : {}),
    };
  }
}
