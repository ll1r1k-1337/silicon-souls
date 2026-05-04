import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { OnModuleDestroy } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import * as Y from 'yjs';
import { DocumentsService } from './documents.service.js';
import {
  DocumentsRealtimeService,
  type DocumentReloadEvent,
} from './documents-realtime.service.js';
import { createYDocFromMarkdown, yDocToMarkdown } from './yjs-markdown.js';

const docs: Map<string, Y.Doc> = new Map();

@WebSocketGateway({ namespace: '/docs', cors: true })
export class DocumentGateway implements OnGatewayConnection, OnModuleDestroy {
  @WebSocketServer()
  server!: Server;

  private readonly saveTimers = new Map<string, NodeJS.Timeout>();
  private readonly unsubscribeReload: () => void;

  constructor(
    private readonly documentsService: DocumentsService,
    documentsRealtime: DocumentsRealtimeService,
  ) {
    this.unsubscribeReload = documentsRealtime.onReload((event) =>
      this.handleDocumentReload(event),
    );
  }

  async handleConnection(client: Socket): Promise<void> {
    const docId = this.getDocId(client);
    if (!docId) {
      client.disconnect(true);
      return;
    }

    client.data.docId = docId;
    await client.join(docId);

    const ydoc = await this.loadDocument(docId);
    client.emit('sync-update', Y.encodeStateAsUpdate(ydoc));
  }

  @SubscribeMessage('sync-update')
  async handleSyncUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ): Promise<void> {
    const docId = client.data.docId as string | undefined;
    if (!docId) return;

    const ydoc = await this.loadDocument(docId);
    const update = this.normalizeUpdate(payload);
    if (!update) return;

    Y.applyUpdate(ydoc, update);
    client.broadcast.to(docId).emit('sync-update', update);
    this.scheduleSave(docId, ydoc);
  }

  onModuleDestroy(): void {
    this.unsubscribeReload();

    for (const timer of this.saveTimers.values()) {
      clearTimeout(timer);
    }
    this.saveTimers.clear();

    for (const doc of docs.values()) {
      doc.destroy();
    }
    docs.clear();
  }

  private getDocId(client: Socket): string | null {
    const queryDocId = client.handshake.query.docId;
    if (Array.isArray(queryDocId)) return queryDocId[0] ?? null;
    return typeof queryDocId === 'string' && queryDocId.length > 0
      ? queryDocId
      : null;
  }

  private async loadDocument(docId: string): Promise<Y.Doc> {
    const existing = docs.get(docId);
    if (existing) return existing;

    const dbDoc = await this.documentsService.getYjsState(docId);
    const ydoc = dbDoc?.yjsState
      ? new Y.Doc()
      : dbDoc?.contentMarkdown
        ? createYDocFromMarkdown(dbDoc.contentMarkdown)
        : new Y.Doc();

    if (dbDoc?.yjsState) {
      Y.applyUpdate(ydoc, dbDoc.yjsState);
    }

    docs.set(docId, ydoc);
    return ydoc;
  }

  private normalizeUpdate(payload: unknown): Uint8Array | null {
    if (payload instanceof Uint8Array) return payload;
    if (payload instanceof ArrayBuffer) return new Uint8Array(payload);
    if (Array.isArray(payload)) return new Uint8Array(payload);

    if (
      payload &&
      typeof payload === 'object' &&
      'data' in payload &&
      Array.isArray((payload as { data?: unknown }).data)
    ) {
      return new Uint8Array((payload as { data: number[] }).data);
    }

    return null;
  }

  private scheduleSave(docId: string, ydoc: Y.Doc): void {
    const existing = this.saveTimers.get(docId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.saveTimers.delete(docId);
      void this.persistDocument(docId, ydoc);
    }, 2000);

    this.saveTimers.set(docId, timer);
  }

  private async persistDocument(docId: string, ydoc: Y.Doc): Promise<void> {
    const contentMarkdown = yDocToMarkdown(ydoc);
    const yjsState = Buffer.from(Y.encodeStateAsUpdate(ydoc));
    await this.documentsService.saveYjsState(docId, yjsState, contentMarkdown);
  }

  private handleDocumentReload(event: DocumentReloadEvent): void {
    const previous = docs.get(event.docId);
    previous?.destroy();

    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, event.yjsState);
    docs.set(event.docId, ydoc);

    this.server?.to(event.docId).emit('document-reload');
  }
}
