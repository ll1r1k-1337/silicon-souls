import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { SpecSessionsService } from './spec-sessions.service';

const StartSessionSchema = z.object({
  rawIdea: z.string().min(1),
});

const SendMessageSchema = z.object({
  message: z.string().min(1),
});

const DirectEditSchema = z.object({
  markdown: z.string().min(1),
  baseVersionId: z.string().optional(),
  changeSummary: z.string().min(1),
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
    const input = SendMessageSchema.parse(body);
    return this.sessions.sendUserMessage(sessionId, input.message);
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
}
