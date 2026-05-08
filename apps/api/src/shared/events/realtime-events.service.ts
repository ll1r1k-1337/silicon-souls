import { Injectable } from '@nestjs/common';

export interface RealtimeEvent {
  channel: 'system-log-changed' | 'background-job-updated' | 'llm-message';
  sessionId?: string;
  jobId?: string;
  payload?: Record<string, unknown>;
}

type Listener = (event: RealtimeEvent) => void;

@Injectable()
export class RealtimeEventsService {
  private readonly listeners = new Set<Listener>();

  emit(event: RealtimeEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
