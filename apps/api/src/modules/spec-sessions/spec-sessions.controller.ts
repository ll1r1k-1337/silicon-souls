import { Body, ConflictException, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { ChatInputEnvelopeSchema } from '@sdd/schemas';
import { SpecSessionsService } from './spec-sessions.service';

const StartSessionSchema = z.object({
  rawIdea: z.string().min(1),
});

const DirectEditSchema = z.object({
  contentJson: z.record(z.unknown()).optional(),
  markdown: z.string().min(1),
  projectionStatus: z.enum(['synced', 'stale', 'failed']).optional(),
  baseVersionId: z.string().optional(),
  changeSummary: z.string().min(1),
});

const DocumentAnchorSchema = z.object({
  from: z.number().int().min(0).optional(),
  to: z.number().int().min(0).optional(),
  selectedText: z.string().optional(),
  documentVersionId: z.string().optional(),
});

const CreateCommentThreadSchema = z.object({
  anchor: DocumentAnchorSchema.default({}),
  selectedText: z.string().optional(),
  content: z.string().min(1),
});

const AddCommentSchema = z.object({
  content: z.string().min(1),
});

const UpdateThreadSchema = z.object({
  status: z.enum(['open', 'resolved']),
});

const UpdateSuggestionSchema = z.object({
  status: z.enum(['pending', 'accepted', 'rejected']),
});

const DocumentAssistantSchema = z.object({
  mode: z.enum(['comment', 'suggestion']).default('comment'),
  prompt: z.string().min(1),
  threadId: z.string().optional(),
  anchor: DocumentAnchorSchema.optional(),
  selectedText: z.string().optional(),
});

@Controller()
export class SpecSessionsController {
  constructor(private readonly sessions: SpecSessionsService) {}

  @Post('projects/:projectId/spec-sessions')
  async start(
    @Param('projectId') projectId: string,
    @Body() body: unknown,
  ): Promise<Record<string, unknown>> {
    const input = StartSessionSchema.parse(body);
    const session = await this.sessions.start(projectId, input.rawIdea);
    return { sessionId: session.id, status: session.status, session };
  }

  @Get('spec-sessions/:sessionId')
  async getWorkspace(@Param('sessionId') sessionId: string): Promise<Record<string, unknown>> {
    return this.sessions.getWorkspace(sessionId);
  }

  @Post('spec-sessions/:sessionId/messages')
  async sendMessage(
    @Param('sessionId') sessionId: string,
    @Body() body: unknown,
  ): Promise<Record<string, unknown>> {
    const input = ChatInputEnvelopeSchema.parse(body);
    return this.sessions.sendUserMessage(sessionId, input);
  }

  @Post('spec-sessions/:sessionId/generate-draft')
  async generateDraft(@Param('sessionId') sessionId: string): Promise<Record<string, unknown>> {
    return this.sessions.enqueueDraft(sessionId);
  }

  @Post('spec-sessions/:sessionId/review')
  async review(@Param('sessionId') sessionId: string): Promise<Record<string, unknown>> {
    return this.sessions.enqueueReview(sessionId);
  }

  @Post('spec-sessions/:sessionId/approve')
  async approve(@Param('sessionId') sessionId: string): Promise<Record<string, unknown>> {
    return this.sessions.approve(sessionId);
  }

  @Patch('spec-sessions/:sessionId/document')
  async directEdit(
    @Param('sessionId') sessionId: string,
    @Body() body: unknown,
  ): Promise<Record<string, unknown>> {
    const input = DirectEditSchema.parse(body);
    return this.sessions.directEdit({ sessionId, ...input });
  }

  @Post('spec-sessions/:sessionId/document/comments')
  async createDocumentCommentThread(
    @Param('sessionId') _sessionId: string,
    @Body() _body: unknown,
  ): Promise<Record<string, unknown>> {
    throw new ConflictException(
      'Document assistant comment threads are disabled. Use chat messages with document context.',
    );
  }

  @Post('document-comment-threads/:threadId/comments')
  async addDocumentComment(
    @Param('threadId') _threadId: string,
    @Body() _body: unknown,
  ): Promise<Record<string, unknown>> {
    throw new ConflictException(
      'Document assistant comments are disabled. Use chat messages with document context.',
    );
  }

  @Patch('document-comment-threads/:threadId')
  async updateDocumentCommentThread(
    @Param('threadId') threadId: string,
    @Body() body: unknown,
  ): Promise<Record<string, unknown>> {
    const input = UpdateThreadSchema.parse(body);
    const thread = await this.sessions.updateDocumentCommentThread(threadId, input);
    return { thread };
  }

  @Patch('document-suggestions/:suggestionId')
  async updateDocumentSuggestion(
    @Param('suggestionId') suggestionId: string,
    @Body() body: unknown,
  ): Promise<Record<string, unknown>> {
    const input = UpdateSuggestionSchema.parse(body);
    const suggestion = await this.sessions.updateDocumentSuggestion(suggestionId, input);
    return { suggestion };
  }

  @Post('spec-sessions/:sessionId/document/assistant')
  async documentAssistant(
    @Param('sessionId') _sessionId: string,
    @Body() _body: unknown,
  ): Promise<Record<string, unknown>> {
    throw new ConflictException(
      'Document assistant endpoint is disabled. Use chat messages with document context.',
    );
  }
}
