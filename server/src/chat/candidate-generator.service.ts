import { Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { AgentsService } from '../agents/agents.service.js';
import type { LlmSettings } from '../settings/settings.service.js';

const candidateSchema = z.object({
  replyMessage: z.string().describe('A reply message from HR about the candidates being presented'),
  candidates: z
    .array(
      z.object({
        handle: z.string().describe('A short unique handle for the candidate, lowercase with underscores'),
        name: z.string().describe('Full name of the candidate'),
        role: z.string().describe('Job title / role the candidate is being hired for'),
        personality: z.string().describe('A paragraph describing the candidate personality and work style'),
        skills: z.array(z.string()).describe('List of 3-5 relevant technical skills'),
        expectedSalary: z.string().describe('Expected annual salary with currency'),
        hrComment: z.string().describe('HR assessment comment about the candidate'),
      }),
    )
    .length(3),
});

@Injectable()
export class CandidateGeneratorService {
  constructor(private readonly agentsService: AgentsService) {}

  async generate(
    userMessage: string,
    llmSettings: LlmSettings,
  ): Promise<{
    replyMessage: string;
    candidates: Array<{
      id: string;
      handle: string;
      name: string;
      role: string;
      skills: string[];
      expectedSalary: string;
      hrComment: string;
    }>;
  }> {
    const llm = new ChatOpenAI({
      openAIApiKey: llmSettings.apiKey,
      apiKey: llmSettings.apiKey,
      modelName: llmSettings.modelName,
      configuration: llmSettings.baseURL
        ? { baseURL: llmSettings.baseURL }
        : undefined,
    });

    const structuredLlm = llm.withStructuredOutput(candidateSchema);

    const result = await structuredLlm.invoke([
      {
        role: 'system',
        content: `You are a professional HR Manager at Silicon Souls. When the user asks you to find or hire someone for a role, generate exactly 3 realistic, diverse candidates. Each candidate should have a unique handle (lowercase, underscores allowed), a realistic name, relevant skills, and a thoughtful HR assessment.`,
      },
      { role: 'user', content: userMessage },
    ]);

    // Save candidates to DB
    const saved = await this.agentsService.createCandidates(
      result.candidates.map((c) => ({
        handle: c.handle,
        name: c.name,
        role: c.role,
        personality: c.personality,
        skills: c.skills,
        expectedSalary: c.expectedSalary,
        hrComment: c.hrComment,
      })),
    );

    return {
      replyMessage: result.replyMessage,
      candidates: saved.map((s, i) => ({
        id: s.id,
        handle: s.handle,
        name: s.name,
        role: s.role,
        skills: result.candidates[i].skills,
        expectedSalary: result.candidates[i].expectedSalary,
        hrComment: result.candidates[i].hrComment,
      })),
    };
  }
}
