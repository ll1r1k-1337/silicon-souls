import { Injectable } from '@nestjs/common';
import { AgentsService } from '../../agents/agents.service.js';
import { ChatSessionStore } from '../../chat/session-store.js';
import type {
  LlmTool,
  ToolCallContext,
} from '../llm-provider.interface.js';
import * as crypto from 'node:crypto';

const CANDIDATE_SCHEMA = {
  type: 'object',
  properties: {
    candidates: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          handle: { type: 'string' },
          name: { type: 'string' },
          role: { type: 'string' },
          personality: { type: 'string' },
          skills: { type: 'array', items: { type: 'string' } },
          expectedSalary: { type: 'string' },
          hrComment: { type: 'string' },
        },
        required: [
          'handle',
          'name',
          'role',
          'personality',
          'skills',
          'expectedSalary',
          'hrComment',
        ],
      },
    },
  },
  required: ['candidates'],
} as const;

interface PresentCandidatesArgs {
  candidates: Array<{
    handle: string;
    name: string;
    role: string;
    personality: string;
    skills: string[];
    expectedSalary: string;
    hrComment: string;
  }>;
}

@Injectable()
export class PresentCandidatesTool {
  static readonly NAME = 'present_candidates';
  static readonly TIMEOUT_MS = 10 * 60 * 1000;

  constructor(
    private readonly agentsService: AgentsService,
    private readonly sessionStore: ChatSessionStore,
  ) {}

  toTool(): LlmTool {
    return {
      name: PresentCandidatesTool.NAME,
      description:
        'Present 3 candidate agents to the user for selection. Returns the candidate the user picked.',
      parametersJsonSchema: CANDIDATE_SCHEMA as unknown as Record<
        string,
        unknown
      >,
      handler: this.handle.bind(this),
    };
  }

  private async handle(
    args: unknown,
    ctx: ToolCallContext,
  ): Promise<unknown> {
    const parsed = args as PresentCandidatesArgs;
    if (
      !parsed ||
      !Array.isArray(parsed.candidates) ||
      parsed.candidates.length !== 3
    ) {
      throw new Error('present_candidates requires exactly 3 candidates');
    }

    const saved = await this.agentsService.createCandidates(
      parsed.candidates.map((c) => ({
        handle: c.handle,
        name: c.name,
        role: c.role,
        personality: c.personality,
        skills: c.skills,
        expectedSalary: c.expectedSalary,
        hrComment: c.hrComment,
      })),
    );

    const toolCallId = crypto.randomUUID();
    this.sessionStore.writeData(ctx.sessionId, {
      type: 'CANDIDATES_LIST',
      payload: saved.map((s, i) => ({
        id: s.id,
        handle: s.handle,
        name: s.name,
        role: s.role,
        personality: s.personality,
        skills: parsed.candidates[i].skills,
        expectedSalary: parsed.candidates[i].expectedSalary,
        hrComment: parsed.candidates[i].hrComment,
      })),
      sessionId: ctx.sessionId,
      toolCallId,
    });

    return this.sessionStore.registerToolCall(
      ctx.sessionId,
      toolCallId,
      PresentCandidatesTool.NAME,
      PresentCandidatesTool.TIMEOUT_MS,
    );
  }
}
