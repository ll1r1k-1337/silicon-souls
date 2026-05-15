import {
  BadRequestException,
  Body,
  Controller,
  NotFoundException,
  Post,
  Res,
} from '@nestjs/common';
import { ChatService } from './chat.service.js';
import { ChatSessionStore } from './session-store.js';
import { AgentsService } from '../agents/agents.service.js';
import express from 'express';

interface ToolResultBody {
  sessionId: string;
  toolCallId: string;
  candidateId: string;
}

@Controller('api/chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly sessionStore: ChatSessionStore,
    private readonly agentsService: AgentsService,
  ) {}

  @Post()
  async chat(
    @Body()
    body: {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    },
    @Res() res: express.Response,
  ): Promise<void> {
    await this.chatService.handleChat(body.messages, res);
  }

  @Post('tool-result')
  async toolResult(
    @Body() body: ToolResultBody,
  ): Promise<{ success: boolean }> {
    if (!body?.sessionId || !body?.toolCallId || !body?.candidateId) {
      throw new BadRequestException(
        'sessionId, toolCallId, candidateId required',
      );
    }
    const session = this.sessionStore.get(body.sessionId);
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    const hired = await this.agentsService.hireCandidate(body.candidateId);
    if (!hired) {
      throw new NotFoundException('Candidate not found');
    }
    const agent = await this.agentsService.findById(body.candidateId);
    const resolved = this.sessionStore.resolveToolCall(
      body.sessionId,
      body.toolCallId,
      {
        status: 'hired',
        candidate: agent
          ? {
              id: agent.id,
              handle: agent.handle,
              name: agent.name,
              role: agent.role,
            }
          : null,
      },
    );
    if (!resolved) {
      throw new NotFoundException('Pending tool call not found');
    }
    return { success: true };
  }
}
