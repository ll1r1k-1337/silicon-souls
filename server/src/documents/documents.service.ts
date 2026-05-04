import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import * as Y from 'yjs';
import { DRIZZLE, type DrizzleDB } from '../database/database.providers.js';
import { documents } from '../database/schema.js';
import { DocumentsRealtimeService } from './documents-realtime.service.js';
import { createYDocFromMarkdown } from './yjs-markdown.js';

@Injectable()
export class DocumentsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly realtime: DocumentsRealtimeService,
  ) {}

  async listDocuments(): Promise<Array<{ id: string; title: string }>> {
    return this.db
      .select({
        id: documents.id,
        title: documents.title,
      })
      .from(documents);
  }

  async getDocumentsByIds(
    ids: string[],
  ): Promise<Array<{ id: string; title: string; contentMarkdown: string | null }>> {
    if (ids.length === 0) return [];

    return this.db
      .select({
        id: documents.id,
        title: documents.title,
        contentMarkdown: documents.contentMarkdown,
      })
      .from(documents)
      .where(inArray(documents.id, ids));
  }

  async getYjsState(
    id: string,
  ): Promise<{ id: string; yjsState: Buffer | null; contentMarkdown: string | null } | null> {
    const rows = await this.db
      .select({
        id: documents.id,
        yjsState: documents.yjsState,
        contentMarkdown: documents.contentMarkdown,
      })
      .from(documents)
      .where(eq(documents.id, id));

    return rows[0] ?? null;
  }

  async saveYjsState(
    id: string,
    yjsState: Buffer,
    contentMarkdown: string,
  ): Promise<void> {
    await this.db
      .update(documents)
      .set({
        yjsState,
        contentMarkdown,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, id));
  }

  async createDocument(
    title: string,
    initialContentMarkdown: string,
  ): Promise<string> {
    const ydoc = createYDocFromMarkdown(initialContentMarkdown);
    const yjsState = Buffer.from(Y.encodeStateAsUpdate(ydoc));
    ydoc.destroy();

    const rows = await this.db
      .insert(documents)
      .values({
        title,
        contentMarkdown: initialContentMarkdown,
        yjsState,
      })
      .returning({ id: documents.id });

    const created = rows[0];
    if (!created) {
      throw new Error('Failed to create document');
    }

    return created.id;
  }

  async overwriteDocument(
    docId: string,
    newContentMarkdown: string,
  ): Promise<void> {
    const existing = await this.getYjsState(docId);
    if (!existing) {
      throw new NotFoundException(`Document ${docId} not found`);
    }

    const ydoc = createYDocFromMarkdown(newContentMarkdown);
    const yjsState = Buffer.from(Y.encodeStateAsUpdate(ydoc));
    ydoc.destroy();

    await this.db
      .update(documents)
      .set({
        contentMarkdown: newContentMarkdown,
        yjsState,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, docId));

    this.realtime.emitReload({ docId, yjsState });
  }
}
