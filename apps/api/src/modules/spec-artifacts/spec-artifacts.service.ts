import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../../shared/database/database.service';
import { specArtifacts } from '../../shared/database/schema';
import { EventStoreService } from '../../shared/events/event-store.service';
import { throwNotFound } from '../../shared/errors/not-found';

@Injectable()
export class SpecArtifactsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly events: EventStoreService,
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
    const payload = {
      ...artifact.payload,
      ...(input.payload ?? {}),
    };

    if ('status' in payload || input.action === 'confirm' || input.action === 'reject') {
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

    return {
      artifact: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    };
  }
}
