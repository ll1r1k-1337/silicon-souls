import { Injectable } from '@nestjs/common';
import { createPrefixedId, nowIso } from '@sdd/domain';
import { DatabaseService } from '../database/database.service';
import { eventStore } from '../database/schema';

@Injectable()
export class EventStoreService {
  constructor(private readonly database: DatabaseService) {}

  async append(params: {
    aggregateId: string;
    aggregateType: string;
    eventType: string;
    payload: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    const id = createPrefixedId('evt');
    await this.database.db.insert(eventStore).values({
      id,
      aggregateId: params.aggregateId,
      aggregateType: params.aggregateType,
      eventType: params.eventType,
      eventVersion: 1,
      payload: params.payload,
      metadata: params.metadata ?? {},
      createdAt: new Date(nowIso()),
    });

    return id;
  }
}
