import { Injectable } from '@nestjs/common';
import { createPrefixedId, nowIso } from '@sdd/domain';
import { DatabaseService } from '../database/database.service';
import { eventStore } from '../database/schema';
import { RealtimeEventsService } from './realtime-events.service';

@Injectable()
export class EventStoreService {
  constructor(
    private readonly database: DatabaseService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

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

    this.realtimeEvents.emit({
      channel: 'system-log-changed',
      sessionId: typeof params.payload.sessionId === 'string' ? params.payload.sessionId : undefined,
      payload: { aggregateId: params.aggregateId, eventType: params.eventType },
    });

    return id;
  }
}
