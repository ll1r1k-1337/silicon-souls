import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';

export interface DocumentReloadEvent {
  docId: string;
  yjsState: Uint8Array;
}

@Injectable()
export class DocumentsRealtimeService {
  private readonly emitter = new EventEmitter();

  emitReload(event: DocumentReloadEvent): void {
    this.emitter.emit('document-reload', event);
  }

  onReload(listener: (event: DocumentReloadEvent) => void): () => void {
    this.emitter.on('document-reload', listener);
    return () => this.emitter.off('document-reload', listener);
  }
}
